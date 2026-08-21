#!/bin/bash
# =============================================================================
# entropy-decrease 后端服务一键部署脚本
# 用法：chmod +x deploy.sh && ./deploy.sh
#
# 重部署前置条件：必须在 .env.production 中补齐 REDIS_PASSWORD 与 CORS_ORIGINS——
# docker-compose.prod.yml 对二者使用 ${VAR:?...} 强制插值，缺失会在 compose
# 阶段报难读错误；本脚本在第 2 节提前做可读校验（三维复审 #10 护栏）。
# =============================================================================

# 严格模式：未定义变量/命令失败/管道失败均立即退出，避免静默错误继续部署
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ---------------------------------------------------------------------------
# 1. 检查前置条件
# ---------------------------------------------------------------------------
log_info "检查前置条件..."

if ! command -v docker &> /dev/null; then
    log_error "Docker 未安装，请先安装 Docker"
    echo "  Ubuntu: sudo apt-get install -y docker.io docker-compose-plugin"
    echo "  CentOS: sudo yum install -y docker docker-compose-plugin"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    log_error "Docker Compose 插件未安装"
    echo "  sudo apt-get install -y docker-compose-plugin"
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker 服务未运行，请执行: sudo systemctl start docker"
    exit 1
fi

log_info "Docker $(docker --version | awk '{print $3}' | tr -d ',') ✓"
log_info "Docker Compose $(docker compose version --short) ✓"

# ---------------------------------------------------------------------------
# 2. 检查 .env.production 配置
# ---------------------------------------------------------------------------
ENV_FILE=".env.production"

if [ ! -f "$ENV_FILE" ]; then
    log_error "$ENV_FILE 不存在，请从模板创建："
    echo "  cp .env.production.example $ENV_FILE"
    echo "  vim $ENV_FILE  # 编辑填入真实配置"
    exit 1
fi

# 检查关键配置是否已修改（硬失败：生产环境禁止带占位符部署，不提供跳过选项）
if grep -q "CHANGE_ME" "$ENV_FILE"; then
    log_error "检测到 $ENV_FILE 中仍有 CHANGE_ME 占位符，部署已中止"
    echo "  请编辑 $ENV_FILE，替换所有 CHANGE_ME 为真实值后重新运行"
    exit 1
fi

# compose 强制项迁移护栏（三维复审 #10）：REDIS_PASSWORD / CORS_ORIGINS 在
# docker-compose.prod.yml 中以 ${VAR:?...} 强制插值——变量缺失时 compose 阶段
# 才报错且信息难读；此处提前 source 校验，转为可读提示快速失败。
# 临时放宽 -u：env 文件中可能存在 ${VAR} 自引用占位行，source 时不应因
# 未定义变量中止（与第 7 节 Redis 健康检查同口径）
set +u
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a
set -u

MISSING_VARS=""
if [ -z "${REDIS_PASSWORD:-}" ]; then MISSING_VARS="$MISSING_VARS REDIS_PASSWORD"; fi
if [ -z "${CORS_ORIGINS:-}" ]; then MISSING_VARS="$MISSING_VARS CORS_ORIGINS"; fi
if [ -n "$MISSING_VARS" ]; then
    log_error "$ENV_FILE 缺少 compose 强制配置:$MISSING_VARS"
    echo "  请编辑 $ENV_FILE 补齐上述变量后重新部署"
    echo "  （docker-compose.prod.yml 以 \${VAR:?} 强制要求，缺失将无法启动）"
    exit 1
fi

log_info "$ENV_FILE 已就绪 ✓"

# ---------------------------------------------------------------------------
# 3. 准备宿主机目录（Nginx bind mount 依赖，缺失时 Docker 会以 root 自动创建，
#    提前创建保证 CI 用户可写入）
# ---------------------------------------------------------------------------
log_info "准备静态资源目录..."
mkdir -p /opt/Entropydecrease/website /opt/Entropydecrease/downloads

# ---------------------------------------------------------------------------
# 4. 启用 BBR 拥塞控制（幂等）
#    实测结论：BBR 对本项目当前链路无改善（RTT 仅 21ms，单流约 140KB/s，
#    启用前后一致）——单流受限并非拥塞控制/丢包所致。保留此配置是因为
#    它对高丢包/高延迟的客户端链路仍可能有益且无副作用，
#    但不应将其当作下载提速手段。
#    容器共享宿主机内核，宿主机启用即对 Nginx 生效。
# ---------------------------------------------------------------------------
log_info "检查 TCP 拥塞控制算法..."
CURRENT_CC=$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo unknown)

if [ "$CURRENT_CC" = "bbr" ]; then
    log_info "BBR 已启用 ✓"
elif sysctl net.ipv4.tcp_available_congestion_control 2>/dev/null | grep -q bbr; then
    log_info "启用 BBR（当前: $CURRENT_CC）..."
    # 写入失败（如非 root）不应中断部署，仅告警
    if printf 'net.core.default_qdisc = fq\nnet.ipv4.tcp_congestion_control = bbr\n' \
         > /etc/sysctl.d/99-bbr.conf 2>/dev/null && sysctl --system >/dev/null 2>&1; then
        log_info "BBR 已启用（现为: $(sysctl -n net.ipv4.tcp_congestion_control)）✓"
    else
        log_warn "BBR 写入/生效失败（需 root 权限），已跳过，不影响部署"
    fi
else
    log_warn "当前内核不支持 BBR（需 Linux ≥ 4.9），已跳过"
fi

# ---------------------------------------------------------------------------
# 5. 构建并启动服务
# ---------------------------------------------------------------------------
log_info "构建 Docker 镜像（首次构建约需 3-5 分钟）..."

docker compose -f docker-compose.prod.yml build --no-cache

log_info "启动所有服务..."

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d

# ---------------------------------------------------------------------------
# 6. 等待服务就绪
# ---------------------------------------------------------------------------
log_info "等待服务启动..."
sleep 10

# ---------------------------------------------------------------------------
# 7. 健康检查
# ---------------------------------------------------------------------------
log_info "执行健康检查..."

check_service() {
    local name=$1
    local url=$2
    if curl -sf "$url" > /dev/null 2>&1; then
        log_info "$name ✓ 运行正常"
        return 0
    else
        log_error "$name ✗ 无法访问 ($url)"
        return 1
    fi
}

ERRORS=0

# PostgreSQL
if docker exec entropy-decrease-postgres pg_isready -U entropy-decrease > /dev/null 2>&1; then
    log_info "PostgreSQL ✓ 运行正常"
else
    log_error "PostgreSQL ✗ 未就绪"
    ERRORS=$((ERRORS + 1))
fi

# Redis：密码经 REDISCLI_AUTH 环境变量注入容器（redis-cli 官方支持的认证方式），
# 完全不在宿主机/容器命令行出现密码参数（-a 方式在进程列表可见；
# --env VAR 无值形式从当前进程环境透传，同样不落命令行）
# 临时放宽 -u：env 文件中可能存在 ${VAR} 自引用占位行，source 时不应因
# 未定义变量中止（本处仅需 REDIS_PASSWORD）
set +u
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a
set -u

if [ -z "${REDIS_PASSWORD:-}" ]; then
    log_error "Redis ✗ REDIS_PASSWORD 未在 $ENV_FILE 中配置"
    ERRORS=$((ERRORS + 1))
else
    # 三维复审 #1 修复：--env REDISCLI_AUTH（无值形式）仅从**当前进程环境**透传，
    # 而 source 出的变量名为 REDIS_PASSWORD——此前 REDISCLI_AUTH 在环境中不存在，
    # docker 静默丢弃该 --env，redis-cli 无认证必然 NOAUTH 失败。
    # 显式 export 把密码映射到 REDISCLI_AUTH 后，现有 --env 透传写法即生效。
    export REDISCLI_AUTH="$REDIS_PASSWORD"
    if docker exec --env REDISCLI_AUTH entropy-decrease-redis \
         redis-cli ping > /dev/null 2>&1; then
        log_info "Redis ✓ 运行正常"
    else
        log_error "Redis ✗ 未就绪"
        ERRORS=$((ERRORS + 1))
    fi
fi

# sync-service
check_service "sync-service" "http://127.0.0.1:8080/health" || ERRORS=$((ERRORS + 1))

# ai-gateway
check_service "ai-gateway" "http://127.0.0.1:8000/health" || ERRORS=$((ERRORS + 1))

# Nginx
check_service "nginx" "http://127.0.0.1:80/health" || ERRORS=$((ERRORS + 1))

echo ""
if [ $ERRORS -eq 0 ]; then
    log_info "============================================"
    log_info "  所有服务启动成功！"
    log_info "============================================"
    echo ""
    echo "  服务地址："
    echo "    Nginx:         http://0.0.0.0:80"
    echo "    sync-service:  http://127.0.0.1:8080"
    echo "    ai-gateway:    http://127.0.0.1:8000"
    echo "    PostgreSQL:    127.0.0.1:5432"
    echo "    Redis:         127.0.0.1:6379"
    echo ""
    echo "  常用命令："
    echo "    查看日志:  docker compose -f docker-compose.prod.yml logs -f"
    echo "    停止服务:  docker compose -f docker-compose.prod.yml down"
    echo "    重启服务:  docker compose -f docker-compose.prod.yml restart"
    echo "    查看状态:  docker compose -f docker-compose.prod.yml ps"
else
    log_error "有 $ERRORS 个服务未就绪，请检查日志："
    echo "  docker compose -f docker-compose.prod.yml logs"
fi
