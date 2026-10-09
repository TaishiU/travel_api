import { Router } from 'express';
import { authController } from '../controllers/auth.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export default router;