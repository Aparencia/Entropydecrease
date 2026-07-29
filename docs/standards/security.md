# 安全规范（事前预防 + 事中应急）

> **来源**：本文档由重组合并生成 —— `17-security-checklist.md`（事前预防）+ `17b-security-incident-response.md`（事中排查与事后处置）。冲突处以更具体/更新版本为准，双方独有内容均保留。

> 第一部分第七节「密钥泄露应急」为简版跑道，完整排查流程见第二部分第四节，两者互补保留。

---

# 第一部分：安全审查清单（事前预防）


### 目的

在发布前系统性地检查应用安全性，防范常见安全漏洞，保护用户数据和系统安全。基于 OWASP Top 10 标准。

### 适用时机

- 每次发布前的安全检查
- 新增认证/授权功能后
- 处理用户数据的功能变更后
- 引入新的第三方依赖后
- 部署配置变更后
- 定期安全审计（建议每季度）

### 流程步骤

#### 第一部分：OWASP Top 10 对照检查

| # | 风险 | 检查项 |
|---|------|--------|
| A01 | 访问控制失效 | 每个 API 都有权限检查？无越权访问？ |
| A02 | 加密机制失效 | 敏感数据加密存储？传输用 HTTPS？ |
| A03 | 注入 | SQL/NoSQL/命令注入防护？参数化查询？ |
| A04 | 不安全设计 | 有威胁建模？业务逻辑有防护？ |
| A05 | 安全配置错误 | 无默认密码？无调试模式？最小权限？ |
| A06 | 易受攻击组件 | 依赖无已知漏洞？版本及时更新？ |
| A07 | 认证失败 | 密码策略？暴力破解防护？Session 管理？ |
| A08 | 数据完整性失败 | 反序列化安全？CDN 资源有 SRI？ |
| A09 | 日志监控不足 | 安全事件有记录？有告警？ |
| A10 | SSRF | 外部 URL 有白名单？无内网访问？ |

#### 第二部分：认证与授权

**认证检查：**
- [ ] 密码使用 bcrypt/argon2 哈希（非 MD5/SHA1）
- [ ] 密码最低强度要求（≥8位，含大小写+数字）
- [ ] 登录失败有速率限制（如 5 次后锁定 15 分钟）
- [ ] JWT 有过期时间（access ≤ 15min）
- [ ] Refresh Token 安全存储（httpOnly cookie）
- [ ] 登出时 Token 失效
- [ ] 密码重置链接有时效（≤ 1 小时）

**授权检查：**
- [ ] 每个 API 端点有权限验证
- [ ] 无水平越权（用户 A 不能访问用户 B 的数据）
- [ ] 无垂直越权（普通用户不能执行管理员操作）
- [ ] 前端隐藏 ≠ 安全（后端必须验证）
- [ ] 文件上传有类型/大小限制

#### 第三部分：数据安全

**传输安全：**
- [ ] 全站 HTTPS（强制重定向）
- [ ] HSTS 头已配置
- [ ] API 通信加密
- [ ] 无敏感数据在 URL 参数中

**存储安全：**
- [ ] 密码哈希存储（永不明文）
- [ ] 敏感字段加密（身份证/银行卡）
- [ ] 数据库连接加密
- [ ] 备份数据加密
- [ ] 日志中无敏感数据（脱敏）

**数据脱敏规则：**
```
手机号：138****1234
邮箱：u***@example.com
身份证：110***********1234
银行卡：****1234
```

#### 第四部分：输入验证与注入防护

- [ ] 所有用户输入在服务端验证（不信任前端）
- [ ] SQL 使用参数化查询/ORM（禁止字符串拼接）
- [ ] XSS 防护：输出转义 + CSP 头
- [ ] 文件上传：验证 MIME 类型 + 重命名 + 隔离存储
- [ ] 路径遍历防护：禁止 `../` 在文件路径中
- [ ] 命令注入防护：避免 exec，必须用时白名单参数
- [ ] 请求体大小限制（防 DoS）

#### 第五部分：依赖安全

- [ ] 运行 `npm audit` / `pip audit` 无高危漏洞
- [ ] 无已知漏洞的依赖版本
- [ ] lock 文件已提交
- [ ] CI 中有自动依赖扫描
- [ ] 定期检查（Dependabot / Renovate）

#### 第六部分：部署安全

- [ ] 生产环境关闭 debug 模式
- [ ] 无默认密码/账号
- [ ] 服务器最小权限原则
- [ ] 容器不以 root 运行
- [ ] 网络隔离（数据库不暴露公网）
- [ ] 密钥通过环境变量/Secret 管理注入
- [ ] CORS 配置正确（非 `*`）
- [ ] 安全响应头已配置：
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy`
  - `Strict-Transport-Security`

#### 第七部分：密钥泄露应急

如果密钥泄露：
1. **立即**轮换泄露的密钥
2. 检查泄露时间窗口内的异常访问
3. 撤销受影响的 token/session
4. 通知受影响的用户（如涉及用户数据）
5. 排查泄露原因（Git 历史？日志？前端代码？）
6. 清理 Git 历史中的密钥（`git filter-branch` 或 BFG）
7. 记录事故并改进流程

### 检查清单（发布前快速过）

- [ ] OWASP Top 10 逐项检查通过
- [ ] 认证/授权逻辑无绕过
- [ ] 敏感数据加密存储和传输
- [ ] 所有输入服务端验证
- [ ] 依赖无高危漏洞
- [ ] 生产配置无 debug/默认密码
- [ ] 安全响应头已配置
- [ ] 日志中无敏感信息
- [ ] CORS 非通配符
- [ ] 文件上传有限制

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| 安全审查报告 | Markdown | docs/security/audit-YYYY-MM.md |
| 依赖扫描结果 | 报告 | CI 输出 |
| 安全配置清单 | 检查表 | docs/security/config-checklist.md |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| 前端验证就够了 | 后端必须重新验证所有输入 |
| 隐藏 URL 就是安全 | 每个端点必须有权限检查 |
| MD5 加密密码 | 用 bcrypt/argon2 |
| 上线后再考虑安全 | 安全是设计时考虑的，不是事后补的 |
| 依赖装了就不管 | 定期扫描和更新 |
| CORS 设 * 方便开发 | 生产环境必须限制来源 |

### 相关文档

- [代码审查规范](code-review.md) — 审查时关注安全
- [环境与配置管理](env-and-config.md) — 密钥管理
- [数据治理与隐私](data-governance.md) — 数据合规
- [事故复盘](incident-postmortem.md) — 安全事件复盘


---

# 第二部分：安全排查与应急响应（事中/事后）


### 目的

在怀疑或确认遭受安全攻击时，提供一套可立即执行的排查、止血、取证和恢复流程。区别于 17-安全检查清单（事前预防），本文档聚焦**事中排查**和**事后处置**。

### 适用时机

- 发现异常登录 / 异常流量 / 异常进程
- 收到安全告警（云厂商、监控、用户举报）
- 数据疑似泄露 / 被拖库
- API 被恶意刷量 / 被爬
- 密钥 / Token 疑似泄露
- 网站被挂马 / 被篡改 / 被植入 webshell

### 流程步骤

#### 第一部分：应急第一原则

```
1. 先隔离，后取证，再恢复
2. 不要慌着删除——先保留现场（日志、内存、进程快照）
3. 假设攻击者可能还在——改所有相关凭证
4. 记录每一步操作和时间（用于复盘）
```

#### 第二部分：快速止血（确认被攻击后 10 分钟内）

**判断影响面并隔离：**
```bash
## 1. 如果服务器被控，先断开公网（保留 SSH 或用云控制台）
##    云厂商安全组：只放行自己的 IP 访问 SSH，关闭其他入站

## 2. 查看当前登录用户 / 异常会话
who
w
last -20                      # 最近登录记录
lastb -20                     # 失败登录尝试

## 3. 查看异常进程（占用 CPU/网络的可疑进程）
top -c
ps auxf
ss -tunlp                     # 监听端口与对应进程

## 4. 立即轮换可能泄露的凭证
##    - 数据库密码、API Key、JWT Secret、SSH Key、云厂商 AccessKey
```

**凭证轮换优先级：**
| 凭证 | 泄露后果 | 处置 |
|------|---------|------|
| 云厂商 AccessKey | 整个账号沦陷 | 立即禁用并重建 |
| SSH 私钥 | 服务器被控 | 换密钥、查 authorized_keys |
| 数据库密码 | 数据泄露 | 改密码 + 查访问日志 |
| JWT Secret | 伪造任意用户 | 换 Secret（会强制所有人重登） |
| 第三方 API Key | 盗用/扣费 | 吊销并重建 |

#### 第三部分：入侵排查清单

**排查登录入侵：**
```bash
## SSH 登录审计
grep "Accepted" /var/log/auth.log          # 成功登录
grep "Failed password" /var/log/auth.log    # 爆破尝试
grep "Accepted" /var/log/auth.log | awk '{print $11}' | sort | uniq -c   # 登录来源 IP 统计

## 检查是否有异常账户 / 后门账户
cat /etc/passwd | grep -v nologin | grep -v false   # 可登录账户
awk -F: '$3 == 0 {print $1}' /etc/passwd            # UID=0 的账户（应只有 root）

## 检查 SSH 后门
cat ~/.ssh/authorized_keys                  # 是否有陌生公钥
ls -la /root/.ssh/ /home/*/.ssh/
```

**排查持久化后门：**
```bash
## 检查定时任务（常见持久化手段）
crontab -l
cat /etc/crontab
ls -la /etc/cron.*/
ls -la /var/spool/cron/

## 检查开机自启
systemctl list-unit-files --state=enabled
ls -la /etc/init.d/

## 检查最近被修改的文件（近 2 天）
find / -mtime -2 -type f 2>/dev/null | grep -vE "/proc|/sys|/run"
```

**排查 Web 后门 / webshell：**
```bash
## 查找近期修改的可疑脚本文件
find /var/www /app -name "*.php" -mtime -7 2>/dev/null
find /var/www /app -type f -mtime -7 2>/dev/null

## 搜索常见 webshell 特征（PHP 示例，其他语言类推）
grep -rE "eval\(|base64_decode|system\(|exec\(|passthru|shell_exec" /var/www 2>/dev/null

## 检查上传目录是否有可执行脚本（通常上传目录不该有 .php/.jsp）
find /path/to/uploads -type f \( -name "*.php" -o -name "*.jsp" -o -name "*.sh" \)
```

#### 第四部分：后端专项排查

**API 被刷 / 被爬：**
```bash
## 分析访问日志，找出高频 IP
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20

## 找出高频访问的接口
awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20

## 找出异常 UA
awk -F'"' '{print $6}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
```
→ 处置：对高频 IP 限流/封禁（见 22b-服务器加固的 fail2ban / Nginx 限流），加验证码，加鉴权。

**数据库被拖库排查：**
- 查数据库访问日志：是否有非应用 IP 的连接
- 查是否有异常的大批量 SELECT / 导出操作
- 确认数据库端口未暴露公网（`ss -tunlp | grep 5432/3306`）
- 检查是否用了弱密码 / 默认密码

**密钥泄露排查（常见于误提交 Git）：**
```bash
## 检查 Git 历史是否曾提交过密钥
git log -p | grep -iE "api[_-]?key|secret|password|token|AKIA"

## 泄露后必须：1) 立即吊销该密钥  2) 清理 Git 历史（git filter-repo）
##            3) 排查该密钥期间是否被滥用
```

#### 第五部分：取证与保留证据

**在恢复/清理前先保留：**
```bash
## 打包关键日志
tar czf /tmp/incident-logs-$(date +%F).tar.gz \
  /var/log/auth.log* /var/log/nginx/ /var/log/syslog* 2>/dev/null

## 保存当前进程/网络快照
ps auxf > /tmp/incident-ps.txt
ss -tunap > /tmp/incident-net.txt

## 把证据下载到本地或独立存储（不要只留在被攻击的机器上）
```

#### 第六部分：恢复

```
1. 确认已清除所有后门（账户、cron、自启、webshell）
2. 所有凭证已轮换
3. 打补丁（修复被利用的漏洞）
4. 从干净的备份恢复（如无法确认系统干净，重装 + 恢复数据）
5. 恢复服务，持续监控
6. 复盘（见 25-事故复盘）
```

> ⚠️ 如果无法 100% 确认系统已清理干净，**最安全的做法是重装系统**，然后从可信备份恢复应用和数据。

### 检查清单

- [ ] 有一份"凭证轮换清单"（列出所有密钥及轮换方式）
- [ ] 知道核心日志位置（auth.log、nginx、应用日志）
- [ ] 数据库/Redis 等端口未暴露公网
- [ ] 有干净的、可恢复的备份
- [ ] 云厂商安全组配置了 SSH 白名单
- [ ] 部署了 fail2ban 防爆破
- [ ] Git 历史无密钥泄露
- [ ] 排查后已保留证据再清理
- [ ] 事后已复盘并修复根因

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| 应急处置记录 | Markdown | docs/incidents/ |
| 证据打包 | 压缩包 | 独立安全存储 |
| 凭证轮换清单 | Markdown | docs/security/credentials-rotation.md |
| 复盘报告 | Markdown | 使用 postmortem-template.md |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| 一发现就急着删文件 | 先隔离 + 取证，再清理 |
| 只清 webshell 不查后门 | 后门（cron/账户/自启）往往更隐蔽 |
| 改了 web 密码就以为安全了 | 所有相关凭证都要轮换 |
| 数据库直接暴露公网 | 只允许内网/应用访问 |
| 清理后不确认就恢复 | 无法确认干净时应重装 |
| 处理完不复盘 | 必须找根因，否则会再次被打 |

### 相关文档

- [安全检查清单](security.md) — 事前预防
- [服务器加固与部署](server-ops.md) — 加固措施
- [日志与可观测性](logging-observability.md) — 日志是排查基础
- [事故复盘](incident-postmortem.md) — 事后复盘
- [数据治理与隐私](data-governance.md) — 数据泄露合规
- [事故复盘模板](../templates/postmortem-template.md)
