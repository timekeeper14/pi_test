// 科技风登录/注册后端 —— Express + MySQL + bcrypt + session
import express from 'express';
import session from 'express-session';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  PORT = '3000',
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'cyber_login',
  SESSION_SECRET = 'dev_secret_change_me',
} = process.env;

// ---------- 数据库连接池 ----------
const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci',
});

// ---------- 应用 ----------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

app.use(
  session({
    name: 'cyber.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 天
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

// ---------- 工具函数 ----------
const RE_USERNAME = /^[A-Za-z0-9_\u4e00-\u9fa5]{3,32}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .toString()
    .split(',')[0]
    .trim()
    .slice(0, 64);
}

async function logLogin({ userId, username, success, req }) {
  try {
    await pool.execute(
      `INSERT INTO login_logs (user_id, username, success, ip, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [userId ?? null, username, success ? 1 : 0, clientIp(req), (req.headers['user-agent'] || '').slice(0, 512)]
    );
  } catch (e) {
    console.warn('[log] 写入登录日志失败:', e.message);
  }
}

// ---------- 健康检查 ----------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down', error: e.message });
  }
});

// ---------- 当前会话 ----------
app.get('/api/me', (req, res) => {
  if (req.session?.user) {
    res.json({ ok: true, user: req.session.user });
  } else {
    res.json({ ok: true, user: null });
  }
});

// ---------- 注册 ----------
app.post('/api/register', async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!RE_USERNAME.test(username)) {
    return res.status(400).json({ ok: false, error: '用户名需为 3-32 位字母、数字、下划线或中文' });
  }
  if (!RE_EMAIL.test(email) || email.length > 255) {
    return res.status(400).json({ ok: false, error: '邮箱格式不正确' });
  }
  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({ ok: false, error: '密码长度需为 8-72 位' });
  }

  try {
    const [dup] = await pool.execute(
      `SELECT username, email FROM users WHERE username = ? OR email = ? LIMIT 1`,
      [username, email]
    );
    if (dup.length) {
      const conflict = dup[0].username === username ? '用户名' : '邮箱';
      return res.status(409).json({ ok: false, error: `${conflict}已被注册` });
    }

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`,
      [username, email, hash]
    );

    req.session.user = { id: result.insertId, username, email };

    return res.status(201).json({
      ok: true,
      user: req.session.user,
      message: '注册成功，已自动登录',
    });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, error: '用户名或邮箱已被注册' });
    }
    console.error('[register]', e);
    return res.status(500).json({ ok: false, error: '服务器内部错误' });
  }
});

// ---------- 登录 ----------
app.post('/api/login', async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: '请输入用户名和密码' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, username, email, password_hash FROM users
        WHERE username = ? OR email = ? LIMIT 1`,
      [username, username.toLowerCase()]
    );

    const user = rows[0];
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;

    await logLogin({ userId: user?.id, username, success: ok, req });

    if (!ok) {
      return res.status(401).json({ ok: false, error: '用户名或密码错误' });
    }

    await pool.execute(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [user.id]);

    req.session.user = { id: user.id, username: user.username, email: user.email };
    return res.json({ ok: true, user: req.session.user, message: '登录成功' });
  } catch (e) {
    console.error('[login]', e);
    return res.status(500).json({ ok: false, error: '服务器内部错误' });
  }
});

// ---------- 登出 ----------
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cyber.sid');
    res.json({ ok: true });
  });
});

// ---------- 启动 ----------
async function start() {
  try {
    await pool.query('SELECT 1');
    console.log(`[db] 已连接 ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  } catch (e) {
    console.error('[db] 连接失败:', e.message);
    console.error('     请先运行: npm run init-db  并检查 .env 配置');
  }

  app.listen(Number(PORT), () => {
    console.log(`\n  ⚡ Cyber Login 已启动`);
    console.log(`  → http://localhost:${PORT}\n`);
  });
}

start();
