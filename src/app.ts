import 'dotenv/config';
import express from 'express';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import areasRouter from './routes/areas.js';
import categoriesRouter from './routes/categories.js';
import activitiesRouter from './routes/activities.js';
import plansRouter from './routes/plans.js';
import bookingQuotesRouter from './routes/bookingQuotes.js';
import bookingsRouter from './routes/bookings.js';
import meRouter from './routes/me.js';
import reviewsRouter from './routes/reviews.js';
import recentlyViewedRouter from './routes/recentlyViewed.js';
import homeRouter from './routes/home.js';
import devRouter from './routes/dev.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();
const port = process.env['PORT'] ?? 3000;

app.use(express.json());

if ((process.env['NODE_ENV'] ?? 'development') !== 'production') {
  app.use('/dev', devRouter);
}

app.use('/v1/health', healthRouter);
app.use('/v1/auth', authRouter);
app.use('/v1/areas', areasRouter);
app.use('/v1/categories', categoriesRouter);
app.use('/v1/activities', activitiesRouter);
app.use('/v1/plans', plansRouter);
app.use('/v1/booking-quotes', bookingQuotesRouter);
app.use('/v1/bookings', bookingsRouter);
app.use('/v1/me', meRouter);
app.use('/v1/reviews', reviewsRouter);
app.use('/v1/recently-viewed', recentlyViewedRouter);
app.use('/v1/home', homeRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`travel-api running on http://localhost:${port}`);
});

export default app;
