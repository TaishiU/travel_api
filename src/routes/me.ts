import { Router } from 'express';
import { favoriteController } from '../controllers/favorite.js';
import { recentlyViewedController } from '../controllers/recentlyViewed.js';
import { userController } from '../controllers/user.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// 会員情報
router.get('/', authenticate, userController.getMe);
router.patch('/', authenticate, userController.updateMe);

// お気に入り
router.get('/favorites', authenticate, favoriteController.getFavorites);
router.post('/favorites', authenticate, favoriteController.addFavorite);
router.delete('/favorites/:activityId', authenticate, favoriteController.removeFavorite);

// 閲覧履歴
router.get('/recently-viewed', authenticate, recentlyViewedController.getRecentlyViewed);

export default router;
