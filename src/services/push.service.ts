/**
 * JanPramaan — Push notification service (FCM)
 * Sends web push notifications via Firebase Cloud Messaging.
 * Gracefully degrades when Firebase is not configured.
 */
import admin from 'firebase-admin';
import fs from 'fs';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

let firebaseInitialised = false;

/**
 * Initialise Firebase Admin SDK.
 * Call once at server startup. If FIREBASE_SERVICE_ACCOUNT is not set,
 * push notifications are silently disabled.
 */
export function initFirebase(): boolean {
  if (!config.firebaseServiceAccount) {
    logger.info('[push] FIREBASE_SERVICE_ACCOUNT not configured — push notifications disabled');
    return false;
  }

  try {
    let serviceAccount: admin.ServiceAccount;

    // Support both inline JSON string and file path
    if (config.firebaseServiceAccount.trim().startsWith('{')) {
      serviceAccount = JSON.parse(config.firebaseServiceAccount);
    } else {
      const raw = fs.readFileSync(config.firebaseServiceAccount, 'utf-8');
      serviceAccount = JSON.parse(raw);
    }

    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firebaseInitialised = true;
    logger.info('[push] Firebase Admin SDK initialised ✓');
    return true;
  } catch (err) {
    logger.error('[push] Failed to initialise Firebase Admin SDK', { error: err });
    return false;
  }
}

/**
 * Send a push notification to all registered devices for a user.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function sendPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string | undefined>,
): Promise<void> {
  if (!firebaseInitialised) return;

  const tokens = await prisma.pushToken.findMany({
    where: { userId },
    select: { id: true, token: true },
  });

  if (tokens.length === 0) return;

  // Sanitise data: FCM requires all values to be strings
  const safeData = data
    ? Object.fromEntries(
        Object.entries(data)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      )
    : undefined;

  const message: admin.messaging.MulticastMessage = {
    tokens: tokens.map((t) => t.token),
    notification: { title, body },
    data: safeData,
    webpush: {
      notification: {
        title,
        body,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
      },
      fcmOptions: {
        link: data?.issueId ? `/issues/${data.issueId}` : '/',
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    // Auto-cleanup: remove tokens that failed with unregistered/invalid errors
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            tokensToRemove.push(tokens[idx].id);
          }
          logger.warn('[push] FCM send failed for token', {
            tokenId: tokens[idx].id,
            error: code,
          });
        }
      });

      if (tokensToRemove.length > 0) {
        await prisma.pushToken.deleteMany({
          where: { id: { in: tokensToRemove } },
        });
        logger.info(`[push] Cleaned up ${tokensToRemove.length} stale token(s)`);
      }
    }

    logger.debug(`[push] Sent to ${response.successCount}/${tokens.length} device(s) for user ${userId}`);
  } catch (err) {
    logger.error('[push] FCM multicast send error', { userId, error: err });
  }
}

/**
 * Register (upsert) a push token for a user.
 */
export async function registerToken(
  userId: string,
  token: string,
  platform?: string,
) {
  return prisma.pushToken.upsert({
    where: { userId_token: { userId, token } },
    create: { userId, token, platform: platform || 'web' },
    update: { platform: platform || 'web' },
  });
}

/**
 * Remove a push token for a user (e.g. on logout).
 */
export async function removeToken(userId: string, token: string) {
  return prisma.pushToken.deleteMany({
    where: { userId, token },
  });
}
/**
 * Send a push notification to a specific FCM registration token.
 * Useful for debugging or one-off alerts.
 */
export async function sendToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string | undefined>,
): Promise<boolean> {
  if (!firebaseInitialised) return false;

  const safeData = data
    ? Object.fromEntries(
        Object.entries(data)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      )
    : undefined;

  const message: admin.messaging.Message = {
    token,
    notification: { title, body },
    data: safeData,
    webpush: {
      notification: {
        title,
        body,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
      },
      fcmOptions: {
        link: data?.link || '/',
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    logger.debug('[push] Manually sent to token', { token, response });
    return true;
  } catch (err: any) {
    logger.error('[push] Failed manual send to token', { token, error: err.code || err.message });
    return false;
  }
}
