import cookieParser from 'cookie-parser';
config();
import express from 'express';
import { config } from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import errorMiddleware from './middlewares/error.middleware.js';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL?.replace(/\/$/, ''),
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

// Middlewares
// Built-In
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Third-Party
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);


app.use(morgan('dev'));
app.use(cookieParser());

// Server Status Check Route
app.get('/ping', (_req, res) => {
  res.send('Pong');
});

// Import all routes
import userRoutes from './routes/user.routes.js';
import courseRoutes from './routes/course.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import miscRoutes from './routes/miscellaneous.routes.js';
import discussionRoutes from './routes/discussion.routes.js';
import blogRoutes from './routes/blog.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import interactionRoutes from './routes/interaction.routes.js';

// THE ROUTE MAP: This tells the server where to go when a user clicks a link.
// For example: if you go to '/api/v1/user', we send you to the 'userRoutes' section.
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/discussions', discussionRoutes);
app.use('/api/v1/blogs', blogRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/interaction', interactionRoutes);
app.use('/api/v1', miscRoutes);

// THE CATCH-ALL: If a user types a wrong address (like '/api/v1/wrong'),
// we send them this 'Not Found' message.
app.all('*', (_req, res) => {
  res.status(404).send('OOPS!!! 404 Page Not Found');
});

// THE EMERGENCY BRAKE: This is our global error handler.
// If any of the code above crashes, this middleware catches it and sends a clean message.
app.use(errorMiddleware);

export default app;
