#!/usr/bin/env bash
# =============================================================================
# 熵减 (Entropydecrease) —— PostgreSQL 数据库备份脚本
# =============================================================================
#
# 用途：
#   对生产环境 PostgreSQL 数据库执行逻辑备份（pg_dump），输出 gzip 压缩文件。
#   支持自动清理过期旧备份，适合通过 crontab 定时调用。
#
# 使用方法：
#   1. 赋予执行权限：  chmod +x server/scripts/db-backup.sh
#   2. 手动执行：      ./server/scripts/db-backup.sh
#   3. 定时执行（推荐每天凌晨 2 点）：
#      crontab -e
#      0 2 * * * /opt/Entropydecrease/server/scripts/db-backup.sh >> /var/log/entropy-db-backup.log 2>&1
#
# 环境变量（可选）：
#   BACKUP_DIR     —— 备份文件存放目录，默认 ./backups/
#   BACKUP_KEEP_DAYS —— 保留天数，默认 7 天
#   DB_CONTAINER   —— PostgreSQL 容器名，默认 entropy-decrease-postgres
#   DB_USER        —— 数据库用户名，默认 entropy-decrease
#   DB_NAME        —— 数据库名，默认 entropy-decrease
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# 可配置变量
# ---------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
DB_CONTAINER="${DB_CONTAINER:-entropy-decrease-postgres}"
DB_USER="${DB_USER:-entropy-decrease}"
DB_NAME="${DB_NAME:-entropy-decrease}"

# ---------------------------------------------------------------------------
# 日志工具
# ---------------------------------------------------------------------------
log_info()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]  $*"; }
log_warn()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN]  $*"; }
log_error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*"; }

# ---------------------------------------------------------------------------
# 前置检查：确认 docker 和容器可用
# ---------------------------------------------------------------------------
if ! command -v docker &> /dev/null; then
    log_error "未找到 docker 命令，请确认 Docker 已安装"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    log_error "PostgreSQL 容器 '${DB_CONTAINER}' 未运行"
    exit 1
fi

# ---------------------------------------------------------------------------
# 创建备份目录
# ---------------------------------------------------------------------------
mkdir -p "${BACKUP_DIR}"

# ---------------------------------------------------------------------------
# 生成带时间戳的文件名
# ---------------------------------------------------------------------------
TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

log_info "开始备份数据库 '${DB_NAME}' ..."
log_info "备份文件：${BACKUP_FILE}"

# ---------------------------------------------------------------------------
# 执行 pg_dump 并压缩输出
# ---------------------------------------------------------------------------
docker exec "${DB_CONTAINER}" \
    pg_dump -U "${DB_USER}" -d "${DB_NAME}" --format=plain --no-owner --no-privileges \
    | gzip > "${BACKUP_FILE}"

# 检查备份文件是否生成成功且非空
if [ ! -s "${BACKUP_FILE}" ]; then
    log_error "备份文件为空或生成失败：${BACKUP_FILE}"
    exit 1
fi

# 获取文件大小（人类可读）
FILE_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
log_info "备份完成，文件大小：${FILE_SIZE}"

# ---------------------------------------------------------------------------
# 清理过期旧备份
# ---------------------------------------------------------------------------
log_info "清理 ${BACKUP_KEEP_DAYS} 天前的旧备份 ..."

# find 删除 .sql.gz 旧文件；若无匹配则不报错
DELETED_COUNT=0
while IFS= read -r old_file; do
    log_info "  删除旧备份：$(basename "${old_file}")"
    rm -f "${old_file}"
    DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -name 'backup_*.sql.gz' -type f -mtime +"${BACKUP_KEEP_DAYS}" 2>/dev/null)

if [ "${DELETED_COUNT}" -gt 0 ]; then
    log_info "已清理 ${DELETED_COUNT} 个旧备份"
else
    log_info "无需清理，所有备份均在保留期内"
fi

log_info "备份任务全部完成 ✓"
