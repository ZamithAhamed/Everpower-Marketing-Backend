import { Request, Response, NextFunction } from 'express';
import * as InvoiceService from '../services/invoice.service';
import { CreateInvoiceInput, UpdateInvoiceInput } from '../validators/invoice.schema';

export async function listInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, page, limit, status, year } = req.query as any;
    const result = await InvoiceService.list({
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      year: year ? Number(year) : undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
}

export async function createInvoice(req: Request<{}, {}, CreateInvoiceInput>, res: Response, next: NextFunction) {
  try {
    const created = await InvoiceService.create(req.body);
    res.status(201).json(created);
  } catch (e) { next(e); }
}

export async function getInvoiceById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const inv = await InvoiceService.getById(req.params.id);
    res.json(inv);
  } catch (e) { next(e); }
}

export async function updateInvoice(req: Request<{ id: string }, {}, UpdateInvoiceInput>, res: Response, next: NextFunction) {
  try {
    const updated = await InvoiceService.update(req.params.id, req.body);
    res.json(updated);
  } catch (e) { next(e); }
}

export async function deleteInvoice(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const result = await InvoiceService.remove(req.params.id);
    res.json(result);
  } catch (e) { next(e); }
}
