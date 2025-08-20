import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validateRequest';
import { createPaymentSchema, idParamSchema, listPaymentQuerySchema, updatePaymentSchema } from '../validators/payment.schema';
import * as PaymentController from '../controllers/payment.controller';

const router = Router();
router.use(requireAuth);

router.get('/', validate(listPaymentQuerySchema), PaymentController.listPayments);
router.post('/', validate(createPaymentSchema), PaymentController.createPayment);
router.get('/:id', validate(idParamSchema), PaymentController.getPaymentById);
router.patch('/:id', validate(updatePaymentSchema), PaymentController.updatePayment);
router.delete('/:id', validate(idParamSchema), PaymentController.deletePayment);

export default router;
