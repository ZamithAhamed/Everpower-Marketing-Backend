import { z } from 'zod';

const priceItem = z.object({
  price: z.string().min(1),
  quantity: z.number().int().positive().optional(),
});

const adhocItem = z.object({
  amount: z.number().int().positive(), // smallest unit (e.g., cents)
  currency: z.string().min(3),
  description: z.string().optional(),
  quantity: z.number().int().positive().optional(), // we’ll multiply amount * quantity
});

export const createInvoiceSchema = z.object({
  body: z.object({
    clientEmail: z.string().email(),
    clientPhone: z.string().min(7),
    amount: z.number().positive(),
    status: z.enum(['PENDING', 'PAID', 'OVERDUE']).default('PENDING'),
    date: z.string().datetime(),
    dueDate: z.string().datetime(),
    description: z.string().optional(),
    customerId: z.string().optional(),

    stripe: z
      .object({
        items: z.array(z.union([priceItem, adhocItem])).min(1),
        daysUntilDue: z.number().int().positive().optional(), // fallback from date→dueDate
        finalizeAndEmail: z.boolean().optional(), // default true
      })
      .optional(),
  }),
});

export const updateInvoiceSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    clientEmail: z.string().email().optional(),
    clientPhone: z.string().min(7).optional(),
    amount: z.number().positive().optional(),
    status: z.enum(['PENDING', 'PAID', 'OVERDUE']).optional(),
    date: z.string().datetime().optional(),
    dueDate: z.string().datetime().optional(),
    description: z.string().optional(),     // <-- NEW
    customerId: z.string().optional(),
  }).refine(d => Object.keys(d).length > 0, {
    message: 'Provide at least one field to update',
    path: ['body'],
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listInvoiceQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(['PENDING','PAID','OVERDUE']).optional(),
    year: z.coerce.number().int().optional(),
  }),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>['body'];
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>['body'];
