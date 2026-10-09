import { Router } from 'express';
import { reviewController } from '../controllers/review.js';

const router = Router();

// GET /v1/reviews/latest
router.get('/latest', reviewController.getLatestReviews);

export default router;
