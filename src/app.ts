/**
 * WitnessLedger — Express application setup
 * Mounts all routes, middleware, and serves static uploads.
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { logger } from './utils/logger.js';

// ─── Logger (re-exported for consumers that import from app) ──────────────
export { logger };

import { config } from './config';
import { prisma } from './prisma/client';
import { errorMiddleware } from './middleware/error.middleware';

// Route imports
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import adminUnitRoutes from './routes/adminUnit.routes';
import projectsRoutes from './routes/projects.routes';
import issuesRoutes from './routes/issues.routes';
import evidenceRoutes from './routes/evidence.routes';
import proofRoutes from './routes/proof.routes';
import residentsRoutes from './routes/residents.routes';
import notificationsRoutes from './routes/notifications.routes';
import metricsRoutes from './routes/metrics.routes';
import otpRoutes from "./routes/otp.js";

// Verification route (inline)
import { Router } from 'express';
import { authMiddleware } from './middleware/auth.middleware';
import { requireRole } from './middleware/rbac.middleware';
import { verifyIssue } from './controllers/verification.controller';

const verificationRouter = Router();
verificationRouter.post('/:id/verify', authMiddleware, requireRole('OFFICER', 'ADMIN'), verifyIssue);

// ─── App ──────────────────────────────────────────────────
const app = express();
app.set('trust proxy', true); // Trust X-Forwarded-* headers, important if behind a proxy like Nginx or in production environments

// Global middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

// ─── Health check ─────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
     await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true, timestamp: new Date().toISOString() });
  }
  catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({ ok: false, db: false });
  }
}
);

// ─── API routes ───────────────────────────────────────────
app.use("/api/otp", otpRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin-units', adminUnitRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/issues', evidenceRoutes);    // /api/issues/:id/evidence
app.use('/api/issues', proofRoutes);       // /api/issues/:id/proof & qr
app.use('/api/issues', verificationRouter); // /api/issues/:id/verify
app.use('/api/residents', residentsRoutes);
app.use('/api/notify', notificationsRoutes);
app.use('/api/metrics', metricsRoutes);

// ─── Global error handler ─────────────────────────────────
app.use(errorMiddleware);

export default app;
