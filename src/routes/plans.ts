import { Router } from 'express';
import { activityController } from '../controllers/activity.js';
import { bookingController } from '../controllers/booking.js';

const router = Router();

router.get('/:planId/availability', bookingController.getAvailability);
router.get('/:planId', activityController.getPlanById);

export default router;
