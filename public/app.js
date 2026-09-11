/* ================= 交互逻辑 ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- 数字雨背景 ---------- */
(function matrixRain() {
  const cv = $('#matrix');
  const ctx = cv.getContext('2d');
  const glyphs = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>/\\+=*#$';
  let cols = 0, drops = [], fontSize = 14, dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(innerWidth / fontSize);
    drops = Array.from({ length: cols }, () => Math.random() * -innerHeight);
  }

  function draw() {
    ctx.fillStyle = 'rgba(4,7,15,0.09)';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < cols; i++) {
      const ch = glyphs[(Math.random() * glyphs.length) | 0];
      const x = i * fontSize;
      const y = drops[i];
      ctx.fillStyle = Math.random() > 0.985 ? '#7c4dff' : '#00e5ff';
      ctx.fillText(ch, x, y);
      if (y > innerHeight && Math.random() > 0.972) drops[i] = 0;
      drops[i] += fontSize * 0.85;
    }
    requestAnimationFrame(draw);
  }

  resize();
  addEventListener('resize', resize);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) draw();
})();

/* ---------- 元素引用 ---------- */
const panel = $('#panel');
const tabs = $('.tabs');
const glider = $('#glider');
const alertBox = $('#alert');
const statusEl = $('#status');
const statusText = $('.status-text', statusEl);
const welcome = $('#welcome');

/* ---------- 标签切换 ---------- */
function switchTab(name) {
  tabs.dataset.active = name;
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  $$('.form').forEach((f) => f.classList.toggle('is-active', f.dataset.view === name));
  hideAlert();
  const first = $(`#${name}-form input`);
  if (first) setTimeout(() => first.focus(), 60);
}
$$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

/* ---------- 提示条 ---------- */
let alertTimer;
function showAlert(msg, type = 'err') {
  clearTimeout(alertTimer);
  alertBox.textContent = msg;
  alertBox.className = `alert show ${type}`;
  alertTimer = setTimeout(hideAlert, 4800);
}
function hideAlert() {
  alertBox.className = 'alert';
}

/* ---------- 状态灯 ---------- */
function setStatus(text, mode = '') {
  statusText.textContent = text;
  statusEl.className = `brand__status ${mode}`;
}

/* ---------- 密码可见切换 ---------- */
$$('.peek').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.classList.toggle('is-on', show);
  });
});

/* ---------- 密码强度 ---------- */
const strengthBox = $('#strength');
const strengthText = $('.strength__text', strengthBox);
const LABELS = ['—', '脆弱', '一般', '良好', '极强'];

function scorePassword(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (/^(.)\1+$/.test(pw) || /^(?:0123|1234|abcd|qwer|password)/i.test(pw)) s = 1;
  return Math.min(4, Math.max(pw.length < 6 ? 1 : 0, Math.min(s, 4) - 1));
}

$('#reg-password').addEventListener('input', (e) => {
  const lv = scorePassword(e.target.value);
  strengthBox.dataset.level = String(lv);
  strengthText.textContent = `密钥强度：${LABELS[lv]}`;
});

/* ---------- 字段提示 ---------- */
function tip(id, msg, ok = false) {
  const el = $(`[data-tip-for="${id}"]`);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
  el.classList.toggle('ok', ok);
  const input = document.getElementById(id);
  input.closest('.field__box').style.borderColor = msg
    ? (ok ? 'rgba(77,255,166,.65)' : 'rgba(255,77,109,.65)')
    : '';
  return ok;
}

/* ---------- 表单校验 ---------- */
const RE_USERNAME = /^[A-Za-z0-9_\u4e00-\u9fa5]{3,32}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

$('#reg-username').addEventListener('blur', (e) => {
  const v = e.target.value.trim();
  if (!v) return tip('reg-username', '');
  tip('reg-username', RE_USERNAME.test(v) ? '✓ 标识可用' : '需 3-32 位字母/数字/下划线/中文', RE_USERNAME.test(v));
});
$('#reg-email').addEventListener('blur', (e) => {
  const v = e.target.value.trim();
  if (!v) return tip('reg-email', '');
  tip('reg-email', RE_EMAIL.test(v) ? '✓ 邮箱格式正确' : '邮箱格式不正确', RE_EMAIL.test(v));
});
$('#reg-password').addEventListener('blur', (e) => {
  const v = e.target.value;
  if (!v) return tip('reg-password', '');
  tip('reg-password', v.length >= 8 ? '✓ 密钥长度合规' : '至少需要 8 位字符', v.length >= 8);
});
$('#reg-password2').addEventListener('input', (e) => {
  const a = $('#reg-password').value;
  const b = e.target.value;
  if (!b) return tip('reg-password2', '');
  tip('reg-password2', a === b ? '✓ 两次输入一致' : '两次输入的密钥不一致', a === b);
});

/* ---------- 请求封装 ---------- */
async function api(url, data) {
  const t0 = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(data || {}),
  });
  const ms = Math.round(performance.now() - t0);
  let body = {};
  try { body = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body, ms };
}

function busy(btn, on) {
  btn.disabled = on;
  btn.classList.toggle('is-loading', on);
  setStatus(on ? '连接中' : '待机', on ? 'busy' : '');
}

/* ---------- 登录 ---------- */
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();

  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  if (!username || !password) return showAlert('请输入用户名和密码');

  const btn = $('.btn', e.target);
  busy(btn, true);
  try {
    const { ok, body, ms } = await api('/api/login', { username, password });
    if (ok && body.ok) {
      setStatus('已授权');
      showAlert(body.message || '登录成功', 'ok');
      openWelcome(body.user);
    } else {
      setStatus('拒绝', 'err');
      showAlert(body.error || '登录失败');
      shake(panel);
    }
    updateLatency(ms);
  } catch {
    setStatus('离线', 'err');
    showAlert('无法连接服务器，请确认后端已启动');
  } finally {
    busy(btn, false);
  }
});

/* ---------- 注册 ---------- */
$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();

  const username = $('#reg-username').value.trim();
  const email = $('#reg-email').value.trim();
  const password = $('#reg-password').value;
  const password2 = $('#reg-password2').value;

  if (!RE_USERNAME.test(username)) return fail('reg-username', '用户名需为 3-32 位字母、数字、下划线或中文');
  if (!RE_EMAIL.test(email)) return fail('reg-email', '邮箱格式不正确');
  if (password.length < 8) return fail('reg-password', '密码长度需为 8-72 位');
  if (password !== password2) return fail('reg-password2', '两次输入的密钥不一致');

  function fail(id, msg) {
    tip(id, msg);
    document.getElementById(id).focus();
    showAlert(msg);
    shake(panel);
  }

  const btn = $('.btn', e.target);
  busy(btn, true);
  try {
    const { ok, body, ms } = await api('/api/register', { username, email, password });
    if (ok && body.ok) {
      setStatus('已授权');
      showAlert(body.message || '注册成功', 'ok');
      e.target.reset();
      strengthBox.dataset.level = '0';
      strengthText.textContent = '密钥强度：—';
      openWelcome(body.user);
    } else {
      setStatus('冲突', 'err');
      showAlert(body.error || '注册失败');
      shake(panel);
    }
    updateLatency(ms);
  } catch {
    setStatus('离线', 'err');
    showAlert('无法连接服务器，请确认后端已启动');
  } finally {
    busy(btn, false);
  }
});

/* ---------- 抖动反馈 ---------- */
function shake(el) {
  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-9px)' },
      { transform: 'translateX(8px)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 380, easing: 'ease-in-out' }
  );
}

/* ---------- 欢迎遮罩 ---------- */
function openWelcome(user) {
  $('#welcome-sub').textContent = `欢迎回来，${user.username}。`;
  $('#welcome-meta').innerHTML = `
    身份编号 <b>#${String(user.id).padStart(6, '0')}</b><br/>
    用户名　 <b>${escapeHtml(user.username)}</b><br/>
    邮箱　　 <b>${escapeHtml(user.email)}</b><br/>
    会话状态 <b>已加密 · AES-256</b>
  `;
  welcome.hidden = false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

$('#logout').addEventListener('click', async () => {
  try { await api('/api/logout', {}); } catch { /* ignore */ }
  welcome.hidden = true;
  switchTab('login');
  $('#login-form').reset();
  setStatus('待机');
  showAlert('已断开连接，会话已销毁', 'ok');
});

/* ---------- 时钟 & 延迟 & 健康检查 ---------- */
function tickClock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString('zh-CN', { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

let latencyBase = 0;
function updateLatency(ms) {
  latencyBase = ms;
  $('#latency').textContent = `${ms}ms`;
}
setInterval(() => {
  const jitter = latencyBase ? Math.max(1, latencyBase + ((Math.random() * 8) | 0) - 4) : '--';
  $('#latency').textContent = typeof jitter === 'number' ? `${jitter}ms` : '--ms';
}, 2200);

async function health() {
  const el = $('#dbState');
  try {
    const t0 = performance.now();
    const res = await fetch('/api/health', { credentials: 'same-origin' });
    const body = await res.json().catch(() => ({}));
    updateLatency(Math.round(performance.now() - t0));
    if (res.ok && body.ok) {
      el.textContent = '在线';
      el.className = '';
    } else {
      el.textContent = '异常';
      el.className = 'warn';
    }
  } catch {
    el.textContent = '离线';
    el.className = 'err';
  }
}
health();
setInterval(health, 10000);

/* ---------- 恢复已有会话 ---------- */
(async function restore() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    const body = await res.json();
    if (body?.user) {
      setStatus('已授权');
      openWelcome(body.user);
    }
  } catch { /* ignore */ }
})();

/* ---------- 快捷键盘 ---------- */
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !welcome.hidden) $('#logout').click();
});
