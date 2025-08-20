import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { pool } from '../config/db';

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(message = 'Authentication failed', code = 'auth/invalid-credentials') {
    super(message);
    this.name = 'AuthError';
    this.status = 401;
    this.code = code;
  }
}

export async function login(email: string, password: string) {
  const [rows] = await pool.execute(
    `SELECT id, email, name, password_hash, role FROM users WHERE email = :email LIMIT 1`,
    { email }
  );
  const user = Array.isArray(rows) && rows[0] as any;
  if (!user) throw new AuthError('User with that email not found.', 'auth/user-not-found');;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new AuthError('Incorrect Credentials.', 'auth/wrong-password');

  const token = jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}