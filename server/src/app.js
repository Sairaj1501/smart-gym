import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errors.js';
import auth from './routes/auth.js';
import members from './routes/members.js';
import { plans, memberships } from './routes/memberships.js';
import attendance from './routes/attendance.js';
import trainers from './routes/trainers.js';
import payments from './routes/payments.js';
import { metrics, progress } from './routes/health.js';
import { workouts, diets } from './routes/plans.js';
import sessions from './routes/sessions.js';
import notifications from './routes/notifications.js';
import analytics from './routes/analytics.js';
import reports from './routes/reports.js';
import { settings, audits, feedback, chatbot } from './routes/misc.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api/auth', auth);
  const A = authenticate; // every route below requires a valid token; each router adds role checks
  app.use('/api/members', A, members);
  app.use('/api/plans', A, plans);
  app.use('/api/memberships', A, memberships);
  app.use('/api/attendance', A, attendance);
  app.use('/api/trainers', A, trainers);
  app.use('/api/payments', A, payments);
  app.use('/api/health-metrics', A, metrics);
  app.use('/api/fitness-progress', A, progress);
  app.use('/api/workout-plans', A, workouts);
  app.use('/api/diet-plans', A, diets);
  app.use('/api/sessions', A, sessions);
  app.use('/api/notifications', A, notifications);
  app.use('/api/analytics', A, analytics);
  app.use('/api/reports', A, reports);
  app.use('/api/settings', A, settings);
  app.use('/api/audit-logs', A, audits);
  app.use('/api/feedback', A, feedback);
  app.use('/api/chat', A, chatbot);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
