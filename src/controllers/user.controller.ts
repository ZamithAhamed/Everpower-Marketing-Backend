import { Request, Response, NextFunction } from 'express';
import * as UserService from '../services/user.service';
import { CreateUserInput, UpdateUserInput } from '../validators/user.schema';

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, role, page, limit } = req.query as any;
    const result = await UserService.listUsers({
      q, role,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
}

export async function createUser(req: Request<{}, {}, CreateUserInput>, res: Response, next: NextFunction) {
  try {
    const created = await UserService.createUser(req.body);
    res.status(201).json(created);
  } catch (e) { next(e); }
}

export async function getUserById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const user = await UserService.getUserById(Number(req.params.id));
    res.json(user);
  } catch (e) { next(e); }
}

export async function updateUser(req: Request<{ id: string }, {}>, res: Response, next: NextFunction) {
  try {
    const updated = await UserService.updateUser(Number(req.params.id), req.body);
    res.json(updated);
  } catch (e) { next(e); }
}

export async function setPassword(req: Request<{ id: string }, {}, { password: string }>, res: Response, next: NextFunction) {
  try {
    const result = await UserService.setPassword(Number(req.params.id), req.body.password);
    res.json(result);
  } catch (e) { next(e); }
}

export async function deleteUser(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const result = await UserService.deleteUser(Number(req.params.id));
    res.json(result);
  } catch (e) { next(e); }
}

export async function resetPasswordImmediate(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body as { email: string };
    console.log('Reseeting Password');
    const out = await UserService.resetPasswordImmediate(email);
    res.json(out);
  } catch (e) { next(e); }
}