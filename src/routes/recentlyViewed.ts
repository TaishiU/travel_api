import { Router } from 'express';
import { recentlyViewedController } from '../controllers/recentlyViewed.js';
import { optionalAuthenticate } from '../middlewares/authenticate.js';

const router = Router();

// 認証任意：ログイン済みなら userId、未ログインなら anonymousId で記録
router.post('/', optionalAuthenticate, recentlyViewedController.recordView);

export default router;
