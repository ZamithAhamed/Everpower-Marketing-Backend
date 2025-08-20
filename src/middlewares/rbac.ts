import { Request, Response, NextFunction } from 'express';

// requireRole('admin')
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as { sub: string | number; email: string; role?: string } | undefined;
    if (!user || !user.role || !roles.includes(user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

// allow if requester is admin OR :id matches JWT sub
export function isSelfOrAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).user as { sub: string | number; role?: string } | undefined;
  if (!auth) return res.status(401).json({ message: 'Unauthorized' });
  const targetId = String((req.params as any).id);
  const isAdmin = auth.role === 'admin';
  const isSelf = String(auth.sub) === targetId;
  if (!isAdmin && !isSelf) return res.status(403).json({ message: 'Forbidden' });
  next();
}
