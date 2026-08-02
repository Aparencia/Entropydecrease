# 熵减 (Entropydecrease) —— 数据库备份与恢复指南

## 备份策略概述

| 项目 | 说明 |
|------|------|
| 备份方式 | `pg_dump` 逻辑备份 + `gzip` 压缩 |
| 备份频率 | 建议每天凌晨 2:00 通过宿主机 crontab 执行 |
| 保留策略 | 自动清理 7 天前的旧备份（可配置） |
| 存储位置 | `server/backups/` 目录 |
| 文件格式 | `backup_YYYYMMDD_HHMMSS.sql.gz` |

## 前置准备

首次使用前，需赋予脚本执行权限：

```bash
cd server
chmod +x scripts/db-backup.sh scripts/db-restore.sh
```

## 配置定时备份（宿主机 crontab）

推荐通过宿主机 crontab 调用备份脚本，实现每日自动备份：

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每天凌晨 2:00 执行，日志输出到 /var/log/entropy-db-backup.log）
0 2 * * * cd /opt/Entropydecrease/server && ./scripts/db-backup.sh >> /var/log/entropy-db-backup.log 2>&1
```

## 手动备份

如需在定时备份之外手动执行（例如在数据库迁移、版本升级前），可直接调用脚本：

```bash
# 进入 server 目录
cd server

# 执行手动备份（备份文件保存到 ./backups/）
./scripts/db-backup.sh

# 自定义备份目录
BACKUP_DIR=/data/entropy-backups ./scripts/db-backup.sh

# 自定义保留天数（默认 7 天）
BACKUP_KEEP_DAYS=30 ./scripts/db-backup.sh
```

## 查看备份文件

```bash
# 列出所有可用备份（按时间倒序）
./scripts/db-restore.sh --list

# 或手动查看
ls -lht backups/
```

## 恢复数据库

> **警告**：恢复操作会覆盖当前数据库中的全部数据，且不可撤销。请在恢复前先备份当前数据。

```bash
# 从指定备份文件恢复（会提示安全确认，需输入 YES）
./scripts/db-restore.sh ./backups/backup_20260802_220000.sql.gz
```

恢复过程：
1. 脚本检查备份文件是否存在且非空
2. 显示恢复目标信息（容器名、数据库名）
3. 要求输入 `YES` 确认
4. 解压备份文件并通过 `psql` 导入数据库（单事务模式，出错自动回滚）

## 环境变量配置

备份和恢复脚本均支持通过环境变量自定义行为：

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `BACKUP_DIR` | `./backups` | 备份文件存储目录 |
| `BACKUP_KEEP_DAYS` | `7` | 备份保留天数 |
| `DB_CONTAINER` | `entropy-decrease-postgres` | PostgreSQL 容器名 |
| `DB_USER` | `entropy-decrease` | 数据库用户名 |
| `DB_NAME` | `entropy-decrease` | 数据库名 |

## 常见问题

### 备份脚本报错"容器未运行"

检查 PostgreSQL 容器是否正常运行：

```bash
docker ps | grep postgres
docker exec entropy-decrease-postgres pg_isready
```

### 备份文件为空

可能是数据库连接信息不匹配，检查环境变量：

```bash
docker exec entropy-decrease-postgres psql -U entropy-decrease -d entropy-decrease -c "SELECT count(*) FROM information_schema.tables;"
```

### 恢复后数据不完整

恢复脚本使用 `--single-transaction` 模式，如果导入过程中出错会自动回滚。检查备份文件完整性：

```bash
# 解压查看 SQL 文件头部
gunzip -c backups/backup_20260802_220000.sql.gz | head -50
```
