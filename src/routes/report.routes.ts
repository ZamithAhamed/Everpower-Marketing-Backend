import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validateRequest';
import { reportsOverviewQuerySchema } from '../validators/report.schema';
import * as ReportController from '../controllers/report.controller';

const router = Router();

router.use(requireAuth); // or requireRole('admin') if you want it restricted

router.get('/overview', validate(reportsOverviewQuerySchema), ReportController.getOverview);

export default router;
