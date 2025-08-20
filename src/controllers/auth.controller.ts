import { Request, Response, NextFunction } from 'express';
import * as AuthService from '../services/auth.service';
import { LoginInput } from '../validators/auth.schema';

export async function login(
  req: Request<{}, {}, LoginInput>,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}