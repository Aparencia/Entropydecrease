# 服务器运维规范（加固部署 + 备份灾备）

> **来源**：本文档由重组合并生成 —— `22b-server-hardening.md`（加固与部署）+ `22-backup-disaster-recovery.md`（备份与灾难恢复）+ examples 精选脚本。冲突处以更具体/更新版本为准，双方独有内容均保留。

---

# 第一部分：服务器加固与部署


### 目的

为自托管（Docker）部署提供一套从零开始的服务器初始化、安全加固、反向代理、HTTPS 证书的可执行操作指南。让个人开发者能安全地把应用部署到公网服务器。

### 适用时机

- 购买新服务器/VPS 后的首次初始化
- 部署应用到公网前的加固
- 配置域名和 HTTPS 时
- 加固现有服务器时
- 遭受攻击后重建服务器时（配合 17b-安全排查）

### 流程步骤

#### 第一部分：服务器初始化

**1. 创建非 root 用户（不要用 root 日常操作）：**
```bash
adduser deploy
usermod -aG sudo deploy          # 赋予 sudo 权限
## 后续用 deploy 用户登录操作
```

**2. 配置 SSH 密钥登录，禁用密码登录：**
```bash
## 本地生成密钥（如果还没有）
ssh-keygen -t ed25519 -C "your-email"

## 把公钥复制到服务器
ssh-copy-id deploy@your-server-ip

## 服务器上编辑 /etc/ssh/sshd_config：
##   PermitRootLogin no
##   PasswordAuthentication no
##   PubkeyAuthentication yes
sudo systemctl restart sshd
```
> ⚠️ 改 SSH 配置前，务必先确认密钥登录能成功，再禁用密码登录，避免把自己锁在外面。

**3. 系统更新：**
```bash
sudo apt update && sudo apt upgrade -y
```

#### 第二部分：防火墙配置

```bash
## 使用 ufw（简单）
sudo ufw default deny incoming     # 默认拒绝所有入站
sudo ufw default allow outgoing    # 允许所有出站
sudo ufw allow 22/tcp              # SSH（建议改成自己 IP 白名单）
sudo ufw allow 80/tcp              # HTTP
sudo ufw allow 443/tcp             # HTTPS
sudo ufw enable
sudo ufw status verbose
```

**关键原则：**
- 数据库端口（5432/3306）、Redis（6379）**绝不对公网开放**
- 这些服务只监听 `127.0.0.1` 或 Docker 内网
- SSH 端口最好限制来源 IP：`sudo ufw allow from YOUR_IP to any port 22`

#### 第三部分：防爆破（fail2ban）

```bash
sudo apt install fail2ban -y

## 创建 /etc/fail2ban/jail.local：
## [sshd]
## enabled = true
## maxretry = 5           # 5 次失败
## bantime = 3600         # 封禁 1 小时
## findtime = 600         # 10 分钟内

sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd    # 查看封禁情况
```

#### 第四部分：反向代理（Nginx）

反向代理让外部只通过 80/443 访问，应用容器监听内网端口。

```nginx
## /etc/nginx/sites-available/myapp
server {
    listen 80;
    server_name example.com;

    # 反代到本地应用（Docker 容器映射的端口）
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API 限流（防刷）：见下方 limit_req 配置
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**限流配置（放在 http 块）：**
```nginx
## /etc/nginx/nginx.conf 的 http { } 内
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
```

```bash
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo nginx -t              # 测试配置
sudo systemctl reload nginx
```

> 完整可用的 Nginx 配置见 本文档附录 B（原 examples/nginx.conf）。

#### 第五部分：HTTPS 证书（Let's Encrypt）

```bash
## 安装 certbot
sudo apt install certbot python3-certbot-nginx -y

## 自动申请证书并配置 Nginx（会自动改上面的 server 块）
sudo certbot --nginx -d example.com -d www.example.com

## 测试自动续期（证书 90 天有效，certbot 会自动续）
sudo certbot renew --dry-run
```
certbot 会自动添加续期定时任务，无需手动操作。

#### 第六部分：Docker 部署加固

```
1. 容器不要用 root 运行（Dockerfile 里加 USER）
2. 数据库/Redis 只在 Docker 内网通信，不映射到宿主机公网
   ✅ 正确：ports 不暴露，或 "127.0.0.1:5432:5432"
   ❌ 错误："5432:5432"（等于对公网开放）
3. 敏感配置用环境变量/secrets，不写进镜像
4. 定期更新基础镜像（打安全补丁）
5. 限制容器资源（防止单容器拖垮主机）
```

> 完整可用的 Docker Compose 骨架见 本文档附录 C（原 examples/docker-compose.yml）。

#### 第七部分：自动化加固脚本

把以上初始化步骤整理成脚本，换服务器时一键执行。基础模板见 本文档附录 A（原 examples/server-init.sh）。

### 检查清单

- [ ] 已创建非 root 用户并用其操作
- [ ] SSH 已配置密钥登录、禁用密码登录、禁用 root 登录
- [ ] 防火墙已启用，默认拒绝入站
- [ ] 数据库/Redis 端口未对公网开放
- [ ] 已安装 fail2ban 防爆破
- [ ] 反向代理已配置（外部只走 80/443）
- [ ] HTTPS 证书已配置且自动续期
- [ ] Docker 容器非 root 运行
- [ ] 系统定期更新（安全补丁）
- [ ] 初始化步骤已脚本化

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| 服务器初始化脚本 | Shell | examples/server-init.sh |
| Nginx 配置 | 配置文件 | /etc/nginx/ + examples/ |
| 部署文档 | Markdown | docs/deployment.md |
| 防火墙规则记录 | 文档 | docs/security/ |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| 一直用 root 操作 | 创建普通用户 + sudo |
| 开放密码登录 SSH | 只用密钥登录 |
| 数据库端口 `5432:5432` 映射 | 不映射或绑 127.0.0.1 |
| 应用直接暴露在公网端口 | 走 Nginx 反向代理 |
| 手动管理 HTTPS 证书 | certbot 自动续期 |
| 服务器配置只在脑子里 | 脚本化，可复现 |

### 相关文档

- [安全检查清单](security.md) — 应用层安全
- [安全排查与应急](security.md) — 被攻击后排查
- [CI/CD 流水线](cicd-release.md) — 自动化部署
- [环境与配置管理](env-and-config.md) — 配置管理
- [备份与灾难恢复](server-ops.md) — 数据备份


---

# 第二部分：备份与灾难恢复


### 目的

确保在数据丢失、服务故障、自然灾害等极端情况下，业务能在可接受的时间内恢复运行，数据损失控制在可接受范围内。

### 适用时机

- 项目上线前制定备份方案
- 定期验证备份有效性
- 发生数据丢失/服务中断后恢复
- 基础设施变更时更新恢复方案
- 定期灾难恢复演练

### 流程步骤

#### 第一部分：定义 RTO 和 RPO

| 指标 | 含义 | 个人项目建议 | 企业级建议 |
|------|------|------------|-----------|
| **RPO** (恢复点目标) | 最多丢失多长时间的数据 | < 24 小时 | < 1 小时 |
| **RTO** (恢复时间目标) | 最多停机多长时间 | < 4 小时 | < 30 分钟 |

根据 RPO/RTO 决定备份频率和恢复方案复杂度。

#### 第二部分：备份策略

**数据库备份：**

| 类型 | 频率 | 保留 | 方式 |
|------|------|------|------|
| 全量备份 | 每日 | 7 天 | pg_dump / mysqldump |
| 增量备份 | 每小时 | 3 天 | WAL 归档 / binlog |
| 异地备份 | 每周 | 4 周 | 复制到 S3/OSS |

**文件/配置备份：**
- 上传文件（用户数据）：实时同步到对象存储
- 配置文件：Git 版本控制（非敏感部分）
- 密钥/证书：加密后备份到安全位置

**备份脚本示例：**
```bash
#!/bin/bash
## backup-db.sh
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/db"
RETENTION_DAYS=7

## 全量备份
pg_dump -Fc mydb > "$BACKUP_DIR/mydb_$TIMESTAMP.dump"

## 上传到异地
aws s3 cp "$BACKUP_DIR/mydb_$TIMESTAMP.dump" s3://my-backups/db/

## 清理过期备份
find "$BACKUP_DIR" -name "*.dump" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: mydb_$TIMESTAMP.dump"
```

#### 第三部分：备份存储

**3-2-1 原则：**
- **3** 份数据副本
- **2** 种不同存储介质
- **1** 份在异地

**存储位置：**
- 本地：服务器另一磁盘/目录
- 异地：云对象存储（S3/OSS/R2）
- 离线：加密硬盘（极端情况）

**安全要求：**
- 备份文件加密（AES-256）
- 备份存储访问权限最小化
- 备份中敏感数据同样受保护

#### 第四部分：恢复流程

**数据库恢复步骤：**
```
1. 确认恢复目标时间点
2. 选择对应的备份文件
3. 停止应用服务（避免写入）
4. 恢复数据库：
   pg_restore -d mydb mydb_20240315.dump
5. 验证数据完整性
6. 重启应用服务
7. 验证功能正常
8. 记录恢复操作
```

**服务恢复步骤：**
```
1. 评估故障范围（哪个服务/组件）
2. 尝试重启服务
3. 如果代码问题 → 回滚到上一版本
4. 如果数据问题 → 从备份恢复
5. 如果基础设施问题 → 切换到备用/重建
6. 验证服务正常
7. 通知用户恢复
```

#### 第五部分：恢复演练

**为什么必须演练：**
- 没验证过的备份 = 没有备份
- 恢复流程不演练 = 紧急时手忙脚乱

**演练频率：** 每季度至少一次

**演练内容：**
1. 从备份恢复数据库到测试环境
2. 验证数据完整性和一致性
3. 记录恢复耗时（是否满足 RTO）
4. 验证应用功能正常
5. 记录发现的问题和改进点

**演练记录：**
```markdown
### 恢复演练 - 2024-03-15
- 备份文件：mydb_20240314.dump
- 恢复耗时：23 分钟（RTO 目标 4h ✓）
- 数据完整性：通过
- 功能验证：通过
- 发现问题：无
- 改进项：自动化恢复脚本
```

#### 第六部分：自动化与监控

**自动化：**
- 备份脚本定时执行（cron）
- 备份完成通知（成功/失败）
- 过期备份自动清理
- 异地同步自动化

**监控：**
- 备份是否按时执行？
- 备份文件大小是否合理？（突然变小可能有问题）
- 存储空间是否充足？
- 上次成功备份是什么时候？

**告警：**
- 备份失败 → 立即告警
- 超过 24h 无成功备份 → 告警
- 存储空间 < 20% → 告警

### 检查清单

- [ ] RTO 和 RPO 已定义
- [ ] 数据库有定时自动备份
- [ ] 备份有异地副本
- [ ] 备份文件加密
- [ ] 恢复流程有文档
- [ ] 恢复演练已执行（至少一次）
- [ ] 备份失败有告警
- [ ] 过期备份自动清理
- [ ] 上传文件/用户数据有备份
- [ ] 备份恢复耗时满足 RTO

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| 备份策略文档 | Markdown | docs/backup/strategy.md |
| 备份脚本 | Shell | scripts/backup/ |
| 恢复操作手册 | Markdown | docs/backup/recovery-runbook.md |
| 演练记录 | Markdown | docs/backup/drills/ |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| 有备份但从不验证 | 定期演练恢复，确认备份有效 |
| 备份只存本地 | 3-2-1 原则，必须有异地副本 |
| 备份不加密 | 备份含敏感数据，必须加密 |
| 没有自动化 | 手动备份一定会忘，必须自动化 |
| 恢复流程只存在脑子里 | 写成文档，紧急时照着做 |
| 只备份数据库 | 上传文件、配置、密钥都要备份 |

### 相关文档

- [发布与回滚](cicd-release.md) — 代码回滚
- [数据库设计](api-design.md) — 迁移可回滚
- [事故复盘](incident-postmortem.md) — 灾难后复盘
- [环境与配置管理](env-and-config.md) — 配置备份


---

# 附录：示例脚本与配置（源自 examples/，重组并入）

## A. 服务器初始化加固脚本（examples/server-init.sh）

```bash
#!/usr/bin/env bash
# 服务器初始化加固脚本（Ubuntu/Debian 示例）
# 配套文档：phase-5-delivery/22b-server-hardening.md
# ⚠️ 执行前务必通读！根据自己的环境（用户名、端口、公钥）修改后再运行。
# 用法：以 root 或 sudo 运行： bash server-init.sh

set -euo pipefail

# ============ 可配置项（按需修改）============
DEPLOY_USER="deploy"          # 部署用的非 root 账户名
SSH_PORT="22"                 # 如需改端口，同步改防火墙与 sshd_config
PUBKEY="ssh-ed25519 AAAA...替换成你自己的公钥... you@host"
# ============================================

echo ">>> 1. 更新系统"
apt-get update && apt-get upgrade -y

echo ">>> 2. 创建部署用户并加入 sudo"
if ! id "$DEPLOY_USER" &>/dev/null; then
    adduser --disabled-password --gecos "" "$DEPLOY_USER"
    usermod -aG sudo "$DEPLOY_USER"
fi

echo ">>> 3. 配置 SSH 公钥登录"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
echo "$PUBKEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"

echo ">>> 4. 加固 SSH（禁用密码登录与 root 直登）"
# 先确认你已能用密钥登录，再执行禁用密码，否则可能锁死自己
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh

echo ">>> 5. 配置防火墙 ufw（只放行 SSH/HTTP/HTTPS）"
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT"/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ">>> 6. 安装 fail2ban（防 SSH 暴力破解）"
apt-get install -y fail2ban
systemctl enable --now fail2ban

echo ">>> 7. 安装 Docker 与 compose 插件"
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker "$DEPLOY_USER"
fi

echo ">>> 8. 开启自动安全更新"
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo ">>> 完成。请用部署用户通过密钥登录验证："
echo "    ssh -p $SSH_PORT $DEPLOY_USER@<服务器IP>"
echo ">>> 后续：装 Nginx + certbot 配置 HTTPS（见 22b 文档与 examples/nginx.conf）"
```

## B. Nginx 反向代理骨架（examples/nginx.conf）

```nginx
# Nginx 反向代理 + HTTPS + 限流示例
# 配套文档：phase-5-delivery/22b-server-hardening.md
# 放置：/etc/nginx/sites-available/myapp，然后软链到 sites-enabled/
# 关键点：应用只监听 127.0.0.1:3000，公网流量一律经 Nginx

# ---------- 限流区（放在 http 块，通常写在 /etc/nginx/nginx.conf）----------
# limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

# ---------- HTTP 自动跳转 HTTPS ----------
server {
    listen 80;
    server_name example.com www.example.com;

    # Let's Encrypt 续期校验放行
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# ---------- HTTPS 主服务 ----------
server {
    listen 443 ssl http2;
    server_name example.com www.example.com;

    # 证书由 certbot 自动生成/续期（见 22b 文档）
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # 现代 TLS 配置
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;

    # 安全响应头
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # 隐藏版本号
    server_tokens off;

    # 上传体积限制
    client_max_body_size 10M;

    # ---------- 反向代理到应用 ----------
    location / {
        # 对接口做限流，突发允许排队 20 个
        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass http://127.0.0.1:3000;   # 应用只在本地监听
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # 静态资源可加长缓存（按需）
    location /static/ {
        proxy_pass http://127.0.0.1:3000;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

## C. Docker Compose 骨架（examples/docker-compose.yml）

```yaml
# 全栈应用 Docker Compose 骨架
# 配套文档：phase-5-delivery/22b-server-hardening.md
# 关键安全点：数据库/Redis 不对公网暴露端口

services:
  # ---------- 前端/后端应用 ----------
  app:
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"    # 只绑本地，由 Nginx 反代（不要写成 "3000:3000"）
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}
      - REDIS_URL=redis://redis:6379
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    deploy:
      resources:
        limits:
          memory: 512M           # 限制资源，防止拖垮主机

  # ---------- 数据库（不暴露公网）----------
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    # 注意：没有 ports 映射 = 只在 Docker 内网可访问，外部访问不到
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./backups:/backups        # 备份目录
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ---------- Redis（不暴露公网）----------
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes    # 开启持久化
    volumes:
      - redis_data:/data

volumes:
  db_data:
  redis_data:

# 说明：
# - Nginx 建议装在宿主机（见 examples/nginx.conf），反代到 127.0.0.1:3000
#   也可作为一个 service 加进来，映射 80/443
# - 启动：docker compose up -d
# - 查看日志：docker compose logs -f app
# - 备份数据库：docker compose exec db pg_dump -U $DB_USER $DB_NAME > backups/db.sql
```
