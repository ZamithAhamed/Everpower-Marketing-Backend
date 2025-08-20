import { z } from 'zod';

export const roleEnum = z.enum(['admin', 'accountant']);

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(8),
    role: roleEnum.default('accountant'),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    role: roleEnum.optional(), // enforce admin-only via middleware
  }).refine((d) => Object.keys(d).length > 0, {
    message: 'Provide at least one field to update',
    path: ['body'],
  }),
});

export const setPasswordSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    password: z.string().min(8),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
});

export const listUserQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    role: roleEnum.optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

export const resetImmediateSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
export type UpdateUserInput = z.infer<typeof updateUserSchema>['body'];
