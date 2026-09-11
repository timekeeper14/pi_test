#!/usr/bin/env bash
#
# WSL 宿主机代理自动修复脚本
# 用于 WSL 重启后宿主机 IP 变化时，自动更新 git 与 ssh 代理配置
#
# 用法:
#   ./scripts/fix-proxy.sh              自动检测并配置
#   ./scripts/fix-proxy.sh 10796        指定代理端口
#   ./scripts/fix-proxy.sh check        仅检测，不修改
#
set -uo pipefail

C_RESET='\033[0m'; C_CYAN='\033[1;36m'; C_GREEN='\033[1;32m'
C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'; C_DIM='\033[2m'

log()  { printf "${C_CYAN}[•]${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN}[✓]${C_RESET} %s\n" "$*"; }
warn() { printf "${C_YELLOW}[!]${C_RESET} %s\n" "$*"; }
err()  { printf "${C_RED}[✗]${C_RESET} %s\n" "$*"; }
dim()  { printf "${C_DIM}    %s${C_RESET}\n" "$*"; }

# ---------- 1. 检测宿主机 IP ----------
detect_host_ip() {
  # 优先用默认路由网关
  local ip
  ip=$(ip route 2>/dev/null | awk '/^default/{print $3; exit}')
  if [ -n "$ip" ]; then echo "$ip"; return 0; fi
  # 回退：/etc/resolv.conf 里的 nameserver（NAT 模式）
  ip=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf 2>/dev/null)
  if [ -n "$ip" ]; then echo "$ip"; return 0; fi
  return 1
}

# ---------- 2. 探测可用的代理端口 ----------
port_open() {
  local ip="$1" port="$2"
  (exec 3<>"/dev/tcp/$ip/$port") >/dev/null 2>&1
}

detect_proxy_port() {
  local ip="$1"
  local candidates="${PROXY_PORT:-} 10796 7890 7897 10809 10808 1080 2080 8888 33210 20171"
  local p
  for p in $candidates; do
    [ -z "$p" ] && continue
    if port_open "$ip" "$p"; then
      # 进一步验证它确实是个 HTTP 代理（能建立 CONNECT 并访问 GitHub）
      if timeout 8 curl -s -o /dev/null --max-time 6 \
           -x "http://$ip:$p" https://github.com 2>/dev/null; then
        printf '%s\n' "$p"
        return 0
      fi
    fi
  done
  return 1
}

# ---------- 3. 写入配置 ----------
write_configs() {
  local ip="$1" port="$2"

  # --- git 代理（仅 GitHub）---
  git config --global http.https://github.com.proxy "http://$ip:$port"
  git config --global https.https://github.com.proxy "http://$ip:$port"
  ok "git 代理已更新 → http://$ip:$port"

  # --- SSH config ---
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  cat > ~/.ssh/config <<EOF
# 由 fix-proxy.sh 自动生成于 $(date '+%Y-%m-%d %H:%M:%S')
# GitHub 走宿主机 HTTP 代理（WSL 网络受限）
Host github.com
    HostName ssh.github.com
    Port 443
    User git
    IdentityFile ~/.ssh/id_ed25519
    ProxyCommand nc -X connect -x ${ip}:${port} %h %p
    StrictHostKeyChecking accept-new
    ServerAliveInterval 30
    ServerAliveCountMax 3
EOF
  chmod 600 ~/.ssh/config
  ok "SSH 配置已更新 → ${ip}:${port} (via ssh.github.com:443)"
}

# ---------- 4. 验证 ----------
verify() {
  local ip="$1" port="$2"
  log "验证连接..."
  local fail=0

  if timeout 20 curl -s -o /dev/null --max-time 15 \
       -x "http://$ip:$port" https://github.com 2>/dev/null; then
    ok "HTTPS (curl via proxy) 可达"
  else
    warn "HTTPS 检测未通过"
    fail=1
  fi

  local out
  out=$(timeout 30 ssh -T git@github.com 2>&1 | head -1)
  if echo "$out" | grep -q "successfully authenticated"; then
    ok "SSH 认证正常：${out}"
  elif echo "$out" | grep -q "Permission denied"; then
    warn "SSH 可达，但公钥未授权：${out}"
    dim "请把 ~/.ssh/id_ed25519.pub 添加到 https://github.com/settings/keys"
  else
    err "SSH 连接异常：${out:-超时}"
    fail=1
  fi

  return $fail
}

# ---------- 主流程 ----------
main() {
  local mode="${1:-fix}"
  printf "${C_CYAN}╭─ WSL 代理修复 ─────────────────╮${C_RESET}\n"

  log "检测宿主机 IP..."
  local ip
  if ! ip=$(detect_host_ip); then
    err "无法检测宿主机 IP，请确认在 WSL 环境中运行"
    return 1
  fi
  ok "宿主机 IP: $ip"

  log "探测代理端口..."
  local port
  if ! port=$(detect_proxy_port "$ip"); then
    err "未找到可用代理端口"
    dim "请确认 Windows 上的代理软件已启动，且允许局域网连接"
    dim "或指定端口：PROXY_PORT=<端口> $0"
    dim "已尝试: ${PROXY_PORT:-} 10796 7890 7897 10809 10808 1080 2080 8888 33210 20171"
    return 1
  fi
  ok "代理端口: $port"

  if [ "$mode" = "check" ]; then
    verify "$ip" "$port"
    return $?
  fi

  write_configs "$ip" "$port"
  echo ""
  verify "$ip" "$port"
  echo ""
  ok "完成！可直接执行 git push"
}

if [ "${1:-}" = "check" ]; then
  main check
elif [ -n "${1:-}" ] && [ "${1:-}" != "fix" ]; then
  # 允许 $0 <port> 的简写
  PROXY_PORT="$1" main fix
else
  main fix
fi
