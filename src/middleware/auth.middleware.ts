/**
 * WitnessLedger — JWT authentication middleware
 * Validates Bearer tokens and attaches the decoded user to req.user.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma/client';

export interface JwtPayload {
  userId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        adminUnitId: string | null;
      };
    }
  }
}

/**
 * Require a valid JWT. Attaches user info to `req.user`.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, adminUnitId: true },
    });

    if (!user) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'User no longer exists' });
      return;
    }

     req.user = { id: user.id, role: user.role, adminUnitId: user.adminUnitId };
    next();
  } catch {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

/**
 * Optional auth — sets req.user if token is present, but does not reject.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, adminUnitId: true },
    });
    if (user) {
      req.user = { id: user.id, role: user.role, adminUnitId: user.adminUnitId };
    }
  } catch {
    // Silent: token invalid but we don't block
  }
  next();
}
