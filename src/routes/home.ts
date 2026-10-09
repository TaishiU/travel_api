import { Router } from 'express';
import { homeController } from '../controllers/home.js';
import { optionalAuthenticate } from '../middlewares/authenticate.js';

const router = Router();

// ログイン済みなら recently_viewed セクションを追加
router.get('/', optionalAuthenticate, homeController.getHome);

export default router;
