import { Request, Response, NextFunction } from 'express';
import * as PaymentService from '../services/payment.service';
import { CreatePaymentInput, UpdatePaymentInput } from '../validators/payment.schema';

export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, invoiceId, status, method, from, to, page, limit } = req.query as any;
    const result = await PaymentService.list({
      q, invoiceId, status, method, from, to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
}

export async function createPayment(req: Request<{}, {}, CreatePaymentInput>, res: Response, next: NextFunction) {
  try {
    const created = await PaymentService.create(req.body);
    res.status(201).json(created);
  } catch (e) { next(e); }
}

export async function getPaymentById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const p = await PaymentService.getById(req.params.id);
    res.json(p);
  } catch (e) { next(e); }
}

export async function updatePayment(req: Request<{ id: string }, {}, UpdatePaymentInput>, res: Response, next: NextFunction) {
  try {
    const updated = await PaymentService.update(req.params.id, req.body);
    res.json(updated);
  } catch (e) { next(e); }
}

export async function deletePayment(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const result = await PaymentService.remove(req.params.id);
    res.json(result);
  } catch (e) { next(e); }
}
