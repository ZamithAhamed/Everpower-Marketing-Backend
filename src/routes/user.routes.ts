import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { requireRole, isSelfOrAdmin } from '../middlewares/rbac';
import { validate } from '../middlewares/validateRequest';
import {
  createUserSchema, updateUserSchema, idParamSchema, listUserQuerySchema,
  setPasswordSchema, resetImmediateSchema
} from '../validators/user.schema';
import * as UserController from '../controllers/user.controller';

const router = Router();

/** PUBLIC: immediate reset that emails a new password */
router.post('/reset-password', validate(resetImmediateSchema), UserController.resetPasswordImmediate);

/** AUTHENTICATED routes */
router.use(requireAuth);

// Admin-only
router.get('/',  validate(listUserQuerySchema), requireRole('admin'), UserController.listUsers);
router.post('/', validate(createUserSchema),    requireRole('admin'), UserController.createUser);
router.delete('/:id', validate(idParamSchema),  requireRole('admin'), UserController.deleteUser);

// Self or Admin
router.get('/:id',    validate(idParamSchema),     isSelfOrAdmin, UserController.getUserById);
router.patch('/:id',  validate(updateUserSchema),  isSelfOrAdmin, UserController.updateUser);
router.patch('/:id/password', validate(setPasswordSchema), isSelfOrAdmin, UserController.setPassword);

export default router;
