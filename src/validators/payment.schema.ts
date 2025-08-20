import { z } from 'zod';

export const createPaymentSchema = z.object({
  body: z.object({
    invoiceId: z.string().min(1),
    clientEmail: z.string().email().optional(),
    amount: z.number().positive(),
    method: z.enum(['CASH','CARD','BANK_TRANSFER','ONLINE','CHEQUE','OTHER']),
    status: z.enum(['PENDING','COMPLETED','FAILED','REFUNDED']).default('COMPLETED'),
    date: z.string().datetime(),
    reference: z.string().optional(),            // NEW
  }),
});

export const updatePaymentSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    clientEmail: z.string().email().optional(),
    amount: z.number().positive().optional(),
    method: z.enum(['CASH','CARD','BANK_TRANSFER','ONLINE','CHEQUE','OTHER']).optional(),
    status: z.enum(['PENDING','COMPLETED','FAILED','REFUNDED']).optional(),
    date: z.string().datetime().optional(),
    reference: z.string().optional(),            // NEW
  }).refine(d => Object.keys(d).length > 0, { message: 'Provide at least one field to update', path: ['body'] }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listPaymentQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    invoiceId: z.string().optional(),
    status: z.enum(['PENDING','COMPLETED','FAILED','REFUNDED']).optional(),
    method: z.enum(['CASH','CARD','BANK_TRANSFER','ONLINE','CHEQUE','OTHER']).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});
