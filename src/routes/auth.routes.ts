import { Router } from 'express';
import { login } from '../controllers/auth.controller';
import { validate } from '../middlewares/validateRequest';
import { loginSchema } from '../validators/auth.schema';

const router = Router();

router.post('/login', validate(loginSchema), login);

export default router;