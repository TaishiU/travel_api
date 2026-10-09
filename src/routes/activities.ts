import { Router } from 'express';
import { activityController } from '../controllers/activity.js';
import { reviewController } from '../controllers/review.js';
import { optionalAuthenticate } from '../middlewares/authenticate.js';

const router = Router();

router.get('/', activityController.getActivities);
// /:activityId より先に定義（パラメータキャプチャ防止）
router.get('/:activityId/reviews', reviewController.getActivityReviews);
router.get('/:activityId/plans', activityController.getPlansByActivityId);
router.get('/:activityId', optionalAuthenticate, activityController.getActivityById);

export default router;