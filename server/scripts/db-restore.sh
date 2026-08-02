#!/usr/bin/env bash
# =============================================================================
# 熵减 (Entropydecrease) —— PostgreSQL 数据库恢复脚本
# =============================================================================
#
# 用途：
#   从 db-backup.sh 生成的 gzip 压缩备份文件恢复 PostgreSQL 数据库。
#   恢复前会进行安全确认提示，防止误操作覆盖生产数据。
#
# 使用方法：
#   1. 赋予执行权限：  chmod +x server/scripts/db-restore.sh
#   2. 执行恢复：      ./server/scripts/db-restore.sh ./backups/backup_20260802_220000.sql.gz
#   3. 查看可用备份：  ./server/scripts/db-restore.sh --list
#
# 环境变量（可选）：
#   DB_CONTAINER   —— PostgreSQL 容器名，默认 entropy-decrease-postgres
#   DB_USER        —— 数据库用户名，默认 entropy-decrease
#   DB_NAME        —— 数据库名，默认 entropy-decrease
#
# 注意：
#   恢复操作会覆盖当前数据库中的全部数据，请务必在恢复前确认已做好当前数据备份。
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# 可配置变量
# ---------------------------------------------------------------------------
DB_CONTAINER="${DB_CONTAINER:-entropy-decrease-postgres}"
DB_USER="${DB_USER:-entropy-decrease}"
DB_NAME="${DB_NAME:-entropy-decrease}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

# ---------------------------------------------------------------------------
# 日志工具
# ---------------------------------------------------------------------------
log_info()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]  $*"; }
log_warn()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN]  $*"; }
log_error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*"; }

# ---------------------------------------------------------------------------
# 使用说明
# ---------------------------------------------------------------------------
usage() {
    echo "用法: $0 <备份文件路径>"
    echo "      $0 --list    列出所有可用备份"
    echo ""
    echo "示例:"
    echo "  $0 ./backups/backup_20260802_220000.sql.gz"
    echo "  $0 --list"
    exit 1
}

# ---------------------------------------------------------------------------
# 列出可用备份
# ---------------------------------------------------------------------------
list_backups() {
    log_info "可用的备份文件（${BACKUP_DIR}）："
    echo ""
    if [ ! -d "${BACKUP_DIR}" ]; then
        log_warn "备份目录 '${BACKUP_DIR}' 不存在"
        exit 0
    fi

    local count=0
    # 按时间倒序列出备份文件
    # 使用 find + sort 替代 ls 解析，避免文件名含空格时 word-splitting 导致的安全隐患
    while IFS= read -r f; do
        local size
        size="$(du -h "$f" | cut -f1)"
        local name
        name="$(basename "$f")"
        local mtime
        mtime="$(stat -c '%y' "$f" 2>/dev/null | cut -d. -f1 || stat -f '%Sm' "$f" 2>/dev/null)"
        echo "  ${name}  (${size}, ${mtime})"
        count=$((count + 1))
    done < <(find "${BACKUP_DIR}" -maxdepth 1 -name 'backup_*.sql.gz' -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)

    if [ "${count}" -eq 0 ]; then
        log_warn "未找到任何备份文件"
    else
        echo ""
        log_info "共 ${count} 个备份"
    fi
}

# ---------------------------------------------------------------------------
# 参数解析
# ---------------------------------------------------------------------------
if [ $# -eq 0 ]; then
    usage
fi

if [ "$1" = "--list" ] || [ "$1" = "-l" ]; then
    list_backups
    exit 0
fi

BACKUP_FILE="$1"

# ---------------------------------------------------------------------------
# 前置检查
# ---------------------------------------------------------------------------
if ! command -v docker &> /dev/null; then
    log_error "未找到 docker 命令，请确认 Docker 已安装"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    log_error "PostgreSQL 容器 '${DB_CONTAINER}' 未运行"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    log_error "备份文件不存在：${BACKUP_FILE}"
    exit 1
fi

if [ ! -s "${BACKUP_FILE}" ]; then
    log_error "备份文件为空：${BACKUP_FILE}"
    exit 1
fi

# ---------------------------------------------------------------------------
# 安全确认提示
# ---------------------------------------------------------------------------
echo ""
log_warn "=========================================="
log_warn "  即将执行数据库恢复操作！"
log_warn "=========================================="
echo ""
echo "  备份文件：  ${BACKUP_FILE}"
echo "  目标容器：  ${DB_CONTAINER}"
echo "  目标数据库：${DB_NAME}"
echo "  目标用户：  ${DB_USER}"
echo ""
log_warn "此操作将覆盖数据库中的全部数据，且不可撤销！"
echo ""
read -p "确认恢复？请输入 YES 继续: " -r CONFIRM

if [ "${CONFIRM}" != "YES" ]; then
    log_info "已取消恢复操作"
    exit 0
fi

# ---------------------------------------------------------------------------
# 执行恢复：解压 + psql 导入
# ---------------------------------------------------------------------------
log_info "开始恢复数据库 '${DB_NAME}' ..."

# 使用 gunzip -c 将压缩内容解压并通过 docker exec 管道传入 psql
gunzip -c "${BACKUP_FILE}" | docker exec -i "${DB_CONTAINER}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" --quiet --single-transaction

log_info "数据库恢复完成 ✓"
log_info "恢复来源：$(basename "${BACKUP_FILE}")"
