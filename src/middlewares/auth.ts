import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
}
