import { Router } from 'express';
import { bookingController } from '../controllers/booking.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// 見積作成は認証任意（未ログインでも見積を確認できる設計）
router.post('/', bookingController.createQuote);
// 見積確認は認証不要
router.get('/:quoteId', bookingController.getQuote);

export default router;