import { Router } from 'express';
import { activityController } from '../controllers/activity.js';

const router = Router();

router.get('/', activityController.getCategories);

export default router;
