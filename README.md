# NEXUS.SYS — 科技风登录/注册页面

一个可交互的赛博朋克/科技风登录注册页面，后端使用 **Express + MySQL**，密码使用 **bcrypt** 哈希存储，会话通过 **express-session** 管理。

## 功能

- 登录 / 注册双表单，标签滑块切换动画
- 数字雨 + 网格 + 扫描线 + 光晕科幻背景
- 实时密码强度指示
- 前端字段校验 + 后端二次校验
- 密码 bcrypt (cost=12) 哈希存储，明文永不落库
- 用户名 / 邮箱均可登录，唯一索引防重复
- 登录审计日志表 `login_logs`（记录 IP、UA、成功与否）
- 会话保持：刷新页面自动恢复登录态
- 顶部状态灯、底部时钟 / 延迟 / 数据库健康检测

## 目录结构

```
.
├── server.js            # Express 后端
├── start.sh             # 一键启动脚本
├── package.json
├── .env                 # 实际环境变量（已配置）
├── .env.example         # 环境变量模板
├── scripts/
│   └── init-db.js       # 建库建表脚本
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

## 一键启动（推荐）

已提供 `start.sh`，自动完成 MySQL 检查/启动、Node 服务管理：

```bash
./start.sh           # 启动（MySQL + Node 全自动）
./start.sh stop      # 停止 Node 服务
./start.sh restart   # 重启
./start.sh status    # 查看状态
./start.sh logs      # 实时日志
```

首次使用赋予执行权限：`chmod +x start.sh`

sudo 密码来源（按优先级）：

1. 环境变量：`SUDO_PASS=你的密码 ./start.sh start`
2. 同目录 `.sudo_pass` 文件（推荐，已被 `.gitignore` 忽略）：
   ```bash
   echo -n '你的密码' > .sudo_pass && chmod 600 .sudo_pass
   ```

## WSL 网络代理修复

如果 WSL 内无法访问 GitHub（宿主机 IP 在重启后会变化），运行：

```bash
./scripts/fix-proxy.sh          # 自动检测并修复 git/ssh 代理
./scripts/fix-proxy.sh check    # 仅检测当前连通性
```

脚本会自动完成：

1. 检测宿主机 IP（默认路由网关）
2. 探测可用代理端口（自动验证 HTTP CONNECT）
3. 更新 git 仅对 GitHub 的代理配置
4. 生成 `~/.ssh/config`，让 SSH 走 `ssh.github.com:443` + 代理
5. 验证 HTTPS 与 SSH 连通性

若代理端口不常见，可指定：

```bash
PROXY_PORT=7890 ./scripts/fix-proxy.sh
```

### 开机自动加载

`~/.wsl-proxy.sh`（由 `~/.bashrc` 引用）会在每次打开终端时自动检测并修复代理，
同时导出 `http_proxy` / `https_proxy` 等环境变量。手动重跑：

```bash
source ~/.wsl-proxy.sh
```

静默模式（不打印提示）：

```bash
WSL_PROXY_QUIET=1 source ~/.wsl-proxy.sh
```

## 手动安装步骤

### 1. 安装 MySQL（Ubuntu/WSL）

```bash
sudo apt update
sudo apt install -y mysql-server
sudo service mysql start
```

设置 root 密码（可选，若用 auth_socket 可跳过）：

```bash
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password'; FLUSH PRIVILEGES;"
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 MySQL 密码
```

### 4. 初始化数据库

```bash
npm run init-db
```

### 5. 启动

```bash
npm start
# 或使用一键脚本
./start.sh start
```

浏览器打开 http://localhost:3000

## 数据库表

**users**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT UNSIGNED | 主键，自增 |
| username | VARCHAR(32) | 唯一 |
| email | VARCHAR(255) | 唯一 |
| password_hash | VARCHAR(255) | bcrypt 哈希 |
| created_at | TIMESTAMP | 注册时间 |
| last_login_at | TIMESTAMP | 最近登录 |

**login_logs**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT UNSIGNED | 主键 |
| user_id | BIGINT UNSIGNED | 用户 ID（可为空） |
| username | VARCHAR(32) | 尝试的用户名 |
| success | TINYINT(1) | 是否成功 |
| ip | VARCHAR(64) | 来源 IP |
| user_agent | VARCHAR(512) | 浏览器 UA |
| created_at | TIMESTAMP | 时间 |

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（含 DB 连通性） |
| GET | `/api/me` | 获取当前会话用户 |
| POST | `/api/register` | 注册 `{username, email, password}` |
| POST | `/api/login` | 登录 `{username, password}`（用户名或邮箱） |
| POST | `/api/logout` | 登出 |

## 安全说明

- 密码使用 bcrypt cost=12，不可逆
- 所有 SQL 使用参数化查询（`pool.execute`），防注入
- 前端输出经过 HTML 转义，防 XSS
- 会话 Cookie `httpOnly` + `sameSite=lax`
- 生产环境请修改 `SESSION_SECRET` 并启用 HTTPS（`cookie.secure = true`）
