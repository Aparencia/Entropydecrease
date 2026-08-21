#!/usr/bin/env bash
# =============================================================================
# 熵减后端服务 — 快速回滚脚本
#
# 使用方法：
#   ./rollback.sh                 # 回滚到上一个 Git 标签（最近一次正式发布版本）
#   ./rollback.sh v0.30.0         # 回滚到指定 Git 标签或分支
#   ./rollback.sh abc1234         # 回滚到指定 Git commit
#
# 前置条件：
#   1. 当前工作目录为本仓库 server/ 目录（或其父目录）
#   2. 已安装 docker 和 docker compose 插件
#   3. .env.production 配置文件存在且内容正确
#
# 回滚流程：
#   1. 保存当前 HEAD 引用（用于 --undo 恢复）
#   2. 切换到目标版本（标签/分支/commit）
#   3. 重新构建 Docker 镜像
#   4. 重启服务
#   5. 执行健康检查验证回滚是否成功
#
# 恢复命令（回滚失败时）：
#   ./rollback.sh <保存的 HEAD 引用>
# =============================================================================

set -euo pipefail

# ── 颜色与日志工具 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # 无颜色

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "${CYAN}[STEP]${NC} $1"; }

# ── 参数解析 ──────────────────────────────────────────────────────
# 默认回滚目标：上一个 Git 标签（即上一个正式发布版本）
TARGET="${1:-}"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
# 回滚前保存的 HEAD 引用，用于失败时恢复
ROLLBACK_REF_FILE=".rollback-prev-head"
# 健康检查重试次数
HEALTH_RETRIES=5
# 健康检查间隔（秒）
HEALTH_INTERVAL=5

# ── 辅助函数 ──────────────────────────────────────────────────────

# 获取上一个 Git 标签（按标签创建时间倒序，取第二个，因为当前 HEAD 可能就是最新标签）
get_previous_tag() {
  # 获取当前 HEAD 所在的标签列表（排除当前版本，取上一个）
  local current_tag
  current_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

  if [[ -z "$current_tag" ]]; then
    log_error "无法获取当前 Git 标签，请手动指定回滚目标"
    echo "  用法: $0 <标签名|分支名|commit hash>"
    exit 1
  fi

  # 获取标签列表，排除当前标签，取最近的一个
  local prev_tag
  prev_tag=$(git tag --sort=-creatordate | grep -v "^${current_tag}$" | head -1)

  if [[ -z "$prev_tag" ]]; then
    log_error "没有找到历史标签，无法回滚"
    echo "  请手动指定: $0 <标签名|分支名|commit hash>"
    exit 1
  fi

  echo "$prev_tag"
}

# 检查前置条件
check_prerequisites() {
  log_step "检查前置条件..."

  # 检查 Docker
  if ! command -v docker &>/dev/null; then
    log_error "Docker 未安装"
    exit 1
  fi

  # 检查 docker compose 插件
  if ! docker compose version &>/dev/null; then
    log_error "Docker Compose 插件未安装"
    exit 1
  fi

  # 检查 Docker 是否运行
  if ! docker info &>/dev/null; then
    log_error "Docker 服务未运行"
    exit 1
  fi

  # 确保当前在 server/ 目录
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    # 尝试自动进入 server/ 目录
    if [[ -d "server" && -f "server/$COMPOSE_FILE" ]]; then
      cd server
      log_info "自动进入 server/ 目录"
    else
      log_error "找不到 $COMPOSE_FILE，请在 server/ 目录或仓库根目录执行"
      exit 1
    fi
  fi

  # 检查环境配置文件
  if [[ ! -f "$ENV_FILE" ]]; then
    log_error "$ENV_FILE 不存在"
    exit 1
  fi

  log_info "前置条件检查通过 ✓"
}

# 健康检查：验证回滚后服务是否正常运行
run_health_checks() {
  log_step "执行健康检查（最多等待 $((HEALTH_RETRIES * HEALTH_INTERVAL)) 秒）..."

  local services=(
    "sync-service|http://127.0.0.1:8080/health"
    "ai-gateway|http://127.0.0.1:8000/health"
  )

  local all_healthy=true

  for entry in "${services[@]}"; do
    local name="${entry%%|*}"
    local url="${entry##*|}"
    local attempts=0

    while (( attempts < HEALTH_RETRIES )); do
      if curl -sf "$url" >/dev/null 2>&1; then
        log_info "$name ✓ 健康检查通过"
        break
      fi
      attempts=$((attempts + 1))
      if (( attempts >= HEALTH_RETRIES )); then
        log_error "$name ✗ 健康检查失败（已重试 $HEALTH_RETRIES 次）"
        all_healthy=false
        break
      fi
      sleep "$HEALTH_INTERVAL"
    done
  done

  # 检查 Nginx（可选，因为 80 端口可能被占用）
  if curl -sf "http://127.0.0.1:80/health" >/dev/null 2>&1; then
    log_info "nginx ✓ 健康检查通过"
  else
    log_warn "nginx 健康检查未通过（可能未部署在 80 端口）"
  fi

  if [[ "$all_healthy" == true ]]; then
    return 0
  else
    return 1
  fi
}

# ── 主流程 ──────────────────────────────────────────────────────

main() {
  check_prerequisites

  # 确定回滚目标
  if [[ -z "$TARGET" ]]; then
    TARGET=$(get_previous_tag)
    log_info "未指定目标版本，自动回滚到上一个标签: $TARGET"
  else
    log_info "目标版本: $TARGET"
  fi

  # 验证目标是否存在
  if ! git rev-parse "$TARGET" &>/dev/null; then
    log_error "Git 引用 '$TARGET' 不存在"
    exit 1
  fi

  # 保存当前 HEAD（用于回滚失败后恢复）
  local current_head
  current_head=$(git rev-parse HEAD)
  echo "$current_head" > "$ROLLBACK_REF_FILE"
  log_info "已保存当前 HEAD: ${current_head:0:8}（恢复命令: $0 ${current_head:0:8}）"

  # 显示回滚信息
  echo ""
  log_warn "即将回滚到版本: $TARGET"
  log_warn "当前版本: $(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)"
  echo ""

  # 切换到目标版本
  log_step "切换到目标版本..."
  git checkout "$TARGET" --quiet

  # 重新构建镜像（使用目标版本的 Dockerfile 和源代码）
  # 直接输出构建日志，避免 pipefail 下管道子命令失败导致误报
  log_step "重新构建 Docker 镜像（可能需要几分钟）..."
  docker compose -f "$COMPOSE_FILE" build

  # 重启服务（仅重启受影响的容器，减少中断时间）
  log_step "重启服务..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate

  # 等待服务启动
  log_step "等待服务启动..."
  sleep 10

  # 执行健康检查
  if run_health_checks; then
    echo ""
    log_info "============================================"
    log_info "  回滚成功！当前版本: $TARGET"
    log_info "============================================"
    echo ""
    echo "  如需恢复到回滚前的版本，执行："
    echo "    $0 ${current_head:0:8}"
    echo ""
    # 清理临时引用文件
    rm -f "$ROLLBACK_REF_FILE"
  else
    echo ""
    log_error "============================================"
    log_error "  回滚后健康检查失败！"
    log_error "============================================"
    echo ""
    echo "  可能的原因："
    echo "    1. 数据库迁移不兼容（新版本数据库 schema 与旧版本代码不匹配）"
    echo "    2. 配置变更（旧版本需要的环境变量在新版本中已移除）"
    echo ""
    echo "  恢复到回滚前的版本："
    echo "    $0 ${current_head:0:8}"
    echo ""
    echo "  查看详细日志："
    echo "    docker compose -f $COMPOSE_FILE logs"
    exit 1
  fi
}

main
