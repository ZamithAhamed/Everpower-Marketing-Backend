import { AnyZodObject, ZodError } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validate(schema: AnyZodObject) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({
          message: 'Validation error',
          errors: e.errors.map((err) => ({
            path: err.path,
            message: err.message,
          })),
        });
      }
      next(e);
    }
  };
}