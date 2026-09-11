// 初始化数据库：创建 database 与 users 表
// 用法: node scripts/init-db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'cyber_login',
} = process.env;

async function main() {
  // 不指定 database 连接，以便创建它
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  console.log(`[db] 已连接 ${DB_USER}@${DB_HOST}:${DB_PORT}`);

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log(`[db] 数据库 ${DB_NAME} 就绪`);

  await conn.query(`USE \`${DB_NAME}\``);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username      VARCHAR(32)  NOT NULL,
      email         VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP    NULL DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_users_username (username),
      UNIQUE KEY uk_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[db] 表 users 就绪');

  // 登录审计日志（可选，用于记录登录尝试）
  await conn.query(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id     BIGINT UNSIGNED NULL,
      username    VARCHAR(32)  NOT NULL,
      success     TINYINT(1)   NOT NULL,
      ip          VARCHAR(64)  NULL,
      user_agent  VARCHAR(512) NULL,
      created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_login_logs_username (username),
      KEY idx_login_logs_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[db] 表 login_logs 就绪');

  await conn.end();
  console.log('[db] 初始化完成 ✅');
}

main().catch((err) => {
  console.error('[db] 初始化失败:', err.message);
  process.exit(1);
});
