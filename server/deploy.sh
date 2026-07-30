#!/bin/bash
# =============================================================================
# entropy-decrease 后端服务一键部署脚本
# 用法：chmod +x deploy.sh && ./deploy.sh
# =============================================================================

set -e

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

# 检查关键配置是否已修改
if grep -q "CHANGE_ME" "$ENV_FILE"; then
    log_warn "检测到 $ENV_FILE 中仍有 CHANGE_ME 占位符"
    echo "  请编辑 $ENV_FILE，替换所有 CHANGE_ME 为真实值"
    read -p "  是否继续？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

log_info "$ENV_FILE 已就绪 ✓"

# ---------------------------------------------------------------------------
# 3. 准备宿主机目录（Nginx bind mount 依赖，缺失时 Docker 会以 root 自动创建，
#    提前创建保证 CI 用户可写入）
# ---------------------------------------------------------------------------
log_info "准备静态资源目录..."
mkdir -p /opt/Entropydecrease/website /opt/Entropydecrease/downloads

# ---------------------------------------------------------------------------
# 4. 构建并启动服务
# ---------------------------------------------------------------------------
log_info "构建 Docker 镜像（首次构建约需 3-5 分钟）..."

docker compose -f docker-compose.prod.yml build --no-cache

log_info "启动所有服务..."

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d

# ---------------------------------------------------------------------------
# 5. 等待服务就绪
# ---------------------------------------------------------------------------
log_info "等待服务启动..."
sleep 10

# ---------------------------------------------------------------------------
# 6. 健康检查
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

# Redis
if docker exec entropy-decrease-redis redis-cli -a "$(grep REDIS_PASSWORD "$ENV_FILE" | cut -d= -f2)" ping > /dev/null 2>&1; then
    log_info "Redis ✓ 运行正常"
else
    log_error "Redis ✗ 未就绪"
    ERRORS=$((ERRORS + 1))
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
