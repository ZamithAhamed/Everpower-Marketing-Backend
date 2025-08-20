import { z } from 'zod';

export const reportsOverviewQuerySchema = z.object({
  query: z.object({
    // Optional month filter like "2025-08"
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
});
