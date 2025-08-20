import { Router } from 'express';
import authRoutes from './auth.routes';
import invoiceRoutes from './invoice.routes';
import paymentRoutes from './payment.routes';
import userRoutes from './user.routes';
import reportRoutes from './report.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

router.use('/auth', authRoutes);
router.use('/invoices', invoiceRoutes);  
router.use('/payments', paymentRoutes);     
router.use('/users', userRoutes);
router.use('/reports', reportRoutes);


export default router;