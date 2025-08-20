import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validateRequest';
import { createInvoiceSchema, idParamSchema, listInvoiceQuerySchema, updateInvoiceSchema } from '../validators/invoice.schema';
import * as InvoiceController from '../controllers/invoice.controller';

const router = Router();
router.use(requireAuth);

router.get('/', validate(listInvoiceQuerySchema), InvoiceController.listInvoices);
router.post('/', validate(createInvoiceSchema), InvoiceController.createInvoice);
router.get('/:id', validate(idParamSchema), InvoiceController.getInvoiceById);
router.patch('/:id', validate(updateInvoiceSchema), InvoiceController.updateInvoice);
router.delete('/:id', validate(idParamSchema), InvoiceController.deleteInvoice);

export default router;
