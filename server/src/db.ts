import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// 尝试从 .env 文件加载环境变量（开发环境，不提交到 git）
try {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

const missing = ['DB_PASSWORD'].filter(k => !process.env[k]);
if (missing.length > 0) {
  console.warn(`⚠ 环境变量 ${missing.join(', ')} 未设置，请创建 .env 文件（参考 .env.example）`);
  console.warn('⚠ 使用默认密码（仅开发环境）');
  if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = '4435790';
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'score_review',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
