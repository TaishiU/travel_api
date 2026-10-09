import { Router } from 'express';
import { bookingController } from '../controllers/booking.js';
import { reviewController } from '../controllers/review.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

router.post('/', authenticate, bookingController.createBooking);
router.get('/', authenticate, bookingController.getBookings);
router.get('/:bookingId', authenticate, bookingController.getBookingById);
router.post('/:bookingId/cancel', authenticate, bookingController.cancelBooking);
router.post('/:bookingId/reviews', authenticate, reviewController.createReview);

export default router;