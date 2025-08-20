import { Request, Response, NextFunction } from 'express';
import * as ReportService from '../services/report.service';

export async function getOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const { month } = req.query as { month?: string };
    const data = await ReportService.getOverview({ month });
    res.json(data);
  } catch (e) { next(e); }
}
