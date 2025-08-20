import mysql from 'mysql2/promise';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { pool } from '../config/db'

function getPool() {
  if (!pool) throw new Error('Database connection pool not initialized');
  return pool;
}


export class NotFoundError extends Error { status = 404; constructor(m='User not found'){ super(m);} }
export class ConflictError extends Error { status = 409; constructor(m='Email already exists'){ super(m);} }

export async function createUser(input: { email: string; name: string; password: string; role: 'admin'|'accountant' }) {
  const password_hash = bcrypt.hashSync(input.password, 10);
  try {
    const [res] = await getPool().execute(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES (:email, :name, :password_hash, :role)`,
      { email: input.email, name: input.name, password_hash, role: input.role }
    );
    // @ts-ignore
    const id = res.insertId as number;
    return getUserById(id);
  } catch (e: any) {
    // ER_DUP_ENTRY
    if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) throw new ConflictError();
    throw e;
  }
}

export async function getUserById(id: number) {
  const [rows] = await getPool().execute(
    `SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = :id LIMIT 1`,
    { id }
  );
  const user = Array.isArray(rows) && rows[0];
  if (!user) throw new NotFoundError();
  return user;
}

export async function listUsers(opts: { q?: string; role?: 'admin'|'user'; page?: number; limit?: number }) {
  const { q, role, page = 1, limit = 20 } = opts;
  const where: string[] = [];
  const params: Record<string, any> = {};
  if (q)    { where.push(`(email LIKE :q OR name LIKE :q)`); params.q = `%${q}%`; }
  if (role) { where.push(`role = :role`); params.role = role; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

//   params.limit = limit;
//   params.offset = (page - 1) * limit;

    const offset = (page - 1) * limit;


  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT SQL_CALC_FOUND_ROWS id, email, name, role, created_at, updated_at
       FROM users
       ${whereSql}
       ORDER BY id DESC
       LIMIT ${limit} OFFSET ${offset}`
    // params
  );
  const [countRows] = await pool.query(`SELECT FOUND_ROWS() AS total`);
  const total = Array.isArray(countRows) ? (countRows[0] as any).total as number : 0;

  return { data: rows, meta: { page, limit, total } };
}

export async function updateUser(id: number, patch: { email?: string; name?: string; role?: 'admin'|'user' }) {
  const sets: string[] = [];
  const params: Record<string, any> = { id };

  if (patch.email !== undefined) { sets.push(`email = :email`); params.email = patch.email; }
  if (patch.name  !== undefined) { sets.push(`name  = :name`);  params.name  = patch.name; }
  if (patch.role  !== undefined) { sets.push(`role  = :role`);  params.role  = patch.role; }

  if (sets.length === 0) return getUserById(id);

  try {
    const [res] = await getPool().execute(
      `UPDATE users SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id`,
      params
    );
    // @ts-ignore
    if (!res.affectedRows) throw new NotFoundError();
    return getUserById(id);
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) throw new ConflictError();
    throw e;
  }
}

export async function setPassword(id: number, password: string) {
  const hash = bcrypt.hashSync(password, 10);
  const [res] = await getPool().execute(
    `UPDATE users SET password_hash = :hash, updated_at = CURRENT_TIMESTAMP WHERE id = :id`,
    { id, hash }
  );
  // @ts-ignore
  if (!res.affectedRows) throw new NotFoundError();
  return { success: true };
}

export async function deleteUser(id: number) {
  const [res] = await getPool().execute(`DELETE FROM users WHERE id = :id`, { id });
  // @ts-ignore
  if (!res.affectedRows) throw new NotFoundError();
  return { success: true };
}

function randomPassword(len = 12) {
  // Ambiguity-safe charset (no 0/O or 1/l)
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += charset[bytes[i] % charset.length];
  return out;
}

async function sendNewPasswordEmail(to: string, plainPassword: string) {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: String(env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  const html = `
    <p>Your password has been reset.</p>
    <p><strong>New password:</strong> <code>${plainPassword}</code></p>
    <p>Please log in and change this password immediately from your profile.</p>
    <p>If you did not request this, contact support.</p>
  `;

  await transporter.sendMail({
    from: env.MAIL_FROM || 'no-reply@example.com',
    to,
    subject: 'Your new password',
    html,
  });
}


export async function resetPasswordImmediate(email: string) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, email FROM users WHERE email = :email LIMIT 1`,
    { email }
  );
  const user = Array.isArray(rows) ? (rows[0] as any) : null;

  // Always return generic response; only proceed if user exists
  if (user) {
    const plain = randomPassword(12);
    const hash = bcrypt.hashSync(plain, 10);

    await pool.execute(
      `UPDATE users SET password_hash = :hash, updated_at = CURRENT_TIMESTAMP WHERE id = :id`,
      { id: user.id, hash }
    );

    try { await sendNewPasswordEmail(user.email, plain); }
    catch (e) { console.error('Email send failed:', e); /* still return generic success */ }
  }

  return { message: 'If that email exists, a new password has been sent.' };
}