#!/usr/bin/env bash
#
# NEXUS.SYS 一键启动脚本
# 用法:
#   ./start.sh          启动（MySQL + Node）
#   ./start.sh stop     停止 Node 服务
#   ./start.sh restart  重启
#   ./start.sh status   查看状态
#   ./start.sh logs     实时查看日志
#
set -uo pipefail

# ---------- 配置 ----------
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/cyber-login.log"
PID_FILE="/tmp/cyber-login.pid"
PORT="${PORT:-3000}"
# sudo 密码：优先读环境变量 SUDO_PASS，其次读同目录 .sudo_pass 文件（已被 .gitignore 忽略）
SUDO_PASS="${SUDO_PASS:-}"
if [ -z "$SUDO_PASS" ] && [ -f "$PROJECT_DIR/.sudo_pass" ]; then
  SUDO_PASS=$(cat "$PROJECT_DIR/.sudo_pass")
fi

# ---------- 颜色 ----------
C_RESET='\033[0m'
C_CYAN='\033[1;36m'
C_GREEN='\033[1;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[1;31m'
C_DIM='\033[2m'

log()   { printf "${C_CYAN}[•]${C_RESET} %s\n" "$*"; }
ok()    { printf "${C_GREEN}[✓]${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}[!]${C_RESET} %s\n" "$*"; }
err()   { printf "${C_RED}[✗]${C_RESET} %s\n" "$*"; }
dim()   { printf "${C_DIM}    %s${C_RESET}\n" "$*"; }

banner() {
  printf "${C_CYAN}"
  cat <<'EOF'
   _  _ ___ __  __ _   _ ___
  | \| | __|\ \/ /| | | / __|
  | .` | _|  >  < | |_| \__ \
  |_|\_|___|/_/\_\ \___/|___/
EOF
  printf "${C_RESET}${C_DIM}  NEXUS.SYS 启动器${C_RESET}\n\n"
}

# ---------- sudo 辅助（复用密码） ----------
SUDO_OK=""
sudo_run() {
  if [ -z "$SUDO_PASS" ]; then
    err "未提供 sudo 密码"
    dim "用法: SUDO_PASS=你的密码 ./start.sh start"
    dim "或将密码写入 .sudo_pass 文件（已被 .gitignore 忽略）"
    return 1
  fi
  if [ -z "$SUDO_OK" ]; then
    if echo "$SUDO_PASS" | sudo -S -p '' true 2>/dev/null; then
      SUDO_OK=1
    else
      err "sudo 密码验证失败（可用 SUDO_PASS=xxx ./start.sh 覆盖）"
      return 1
    fi
  fi
  echo "$SUDO_PASS" | sudo -S -p '' "$@"
}

# ---------- MySQL ----------
mysql_running() {
  ss -tln 2>/dev/null | grep -q ':3306 ' || pgrep -x mysqld >/dev/null 2>&1
}

wait_mysql() {
  local n=0
  while [ $n -lt 30 ]; do
    if mysql -h 127.0.0.1 -P 3306 -u "${DB_USER:-root}" -p"${DB_PASSWORD:-root}" \
        -e "SELECT 1" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    n=$((n + 1))
    # 仅在交互式终端下显示进度，避免污染管道
    [ -t 1 ] && printf "${C_DIM}    等待 MySQL 就绪... %ds${C_RESET}\r" "$n"
  done
  [ -t 1 ] && echo ""
  return 1
}

ensure_mysql() {
  if mysql_running; then
    ok "MySQL 已在运行"
  else
    warn "MySQL 未运行，正在启动..."
    sudo_run service mysql start >/dev/null 2>&1 || {
      err "MySQL 启动失败"; return 1
    }
    ok "MySQL 已启动"
  fi

  # 加载 .env 中的 DB 凭据
  if [ -f "$PROJECT_DIR/.env" ]; then
    DB_USER=$(grep -E '^DB_USER=' "$PROJECT_DIR/.env" | cut -d= -f2- || true)
    DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$PROJECT_DIR/.env" | cut -d= -f2- || true)
  fi

  # 无论此前是否已在运行，都确认真正可连接
  if wait_mysql; then
    ok "MySQL 连接正常 (${DB_USER:-root}@127.0.0.1:3306)"
  else
    err "等待 MySQL 超时"
    return 1
  fi
}

# ---------- Node ----------
node_pid() {
  if [ -f "$PID_FILE" ]; then
    local p; p=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then echo "$p"; return 0; fi
  fi
  pgrep -f "node .*server\.js" | head -1
}

ensure_node() {
  local pid; pid=$(node_pid)
  if [ -n "$pid" ]; then
    warn "Node 服务已在运行 (PID $pid)，先停止..."
    stop_node
    sleep 1
  fi

  [ -d "$PROJECT_DIR/node_modules" ] || {
    warn "缺少依赖，正在安装..."
    (cd "$PROJECT_DIR" && npm install) || { err "依赖安装失败"; return 1; }
  }

  : > "$LOG_FILE"
  (cd "$PROJECT_DIR" && setsid node server.js >>"$LOG_FILE" 2>&1 </dev/null &)
  # 等待端口真正监听（最多 15s）
  local waited=0
  while [ $waited -lt 15 ]; do
    if ss -tln 2>/dev/null | grep -q ":$PORT "; then break; fi
    sleep 1
    waited=$((waited + 1))
  done

  pid=$(node_pid)
  if [ -n "$pid" ]; then
    echo "$pid" > "$PID_FILE"
    ok "Node 服务已启动 (PID $pid)"
  else
    err "Node 服务启动失败，日志："
    sed 's/^/    /' "$LOG_FILE"
    return 1
  fi
}

stop_node() {
  local pid; pid=$(node_pid)
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
    ok "Node 服务已停止 (PID $pid)"
  else
    warn "Node 服务未在运行"
  fi
  rm -f "$PID_FILE"
}

# ---------- 命令 ----------
cmd_start() {
  banner
  ensure_mysql || exit 1
  ensure_node  || exit 1
  echo ""
  ok "启动完成！"
  dim "地址:  http://localhost:$PORT"
  local ip; ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -n "$ip" ] && dim "局域网: http://$ip:$PORT"
  dim "日志:  $LOG_FILE"
  dim "停止:  ./start.sh stop"
  echo ""
}

cmd_stop() {
  banner
  stop_node
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  banner
  local pid; pid=$(node_pid)
  if [ -n "$pid" ]; then ok "Node:  运行中 (PID $pid)"; else warn "Node:  未运行"; fi
  if mysql_running; then ok "MySQL: 运行中"; else err "MySQL: 未运行"; fi
  if ss -tln 2>/dev/null | grep -q ":$PORT "; then
    ok "端口:  $PORT 已监听"
  else
    warn "端口:  $PORT 未监听"
  fi
  echo ""
  dim "健康检查: curl -s http://localhost:$PORT/api/health"
}

cmd_logs() {
  [ -f "$LOG_FILE" ] || { err "日志文件不存在: $LOG_FILE"; exit 1; }
  log "实时日志 (Ctrl+C 退出)"
  tail -f "$LOG_FILE"
}

# ---------- 入口 ----------
case "${1:-start}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  *)
    banner
    echo "用法: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
