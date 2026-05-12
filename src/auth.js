// src/auth.js
// Authentication routes for tenderpreneurs.co.za.
// Mount with: app.use('/api/v1/auth', authRouter)

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { eq, and, isNull, gt } from 'drizzle-orm';

import { db, schema } from './db/index.js';
import {
  AppError,
  asyncHandler,
  hashPassword,
  verifyPassword,
  signAccessToken,
  randomToken,
  sha256,
  cookieOptions,
  auditLog,
  REFRESH_TOKEN_TTL_DAYS,
} from './utils/helpers.js';
import { sendVerificationEmail, sendPasswordResetEmail } from './services/mailer.js';

const router = Router();

const REFRESH_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const ACCESS_TTL_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

// ---------- Per-route rate limiting ----------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password requests. Please try again later.' },
});

// ---------- Validation helper ----------
function checkValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 422, 'VALIDATION_ERROR');
  }
}

// ---------- Session helpers ----------
async function issueRefreshToken(userId, req) {
  const raw = randomToken(48);
  const hash = sha256(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await db.insert(schema.sessions).values({
    userId,
    refreshTokenHash: hash,
    userAgent: req.get('user-agent')?.slice(0, 500) || null,
    ipAddress: req.ip || null,
    expiresAt,
  });
  return raw;
}

function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken) {
    res.cookie('access_token', accessToken, cookieOptions({ maxAgeMs: ACCESS_TTL_MS }));
  }
  if (refreshToken) {
    res.cookie('refresh_token', refreshToken, cookieOptions({ maxAgeMs: REFRESH_TTL_MS }));
  }
}

function clearAuthCookies(res) {
  const opts = { ...cookieOptions({ maxAgeMs: 0 }) };
  res.clearCookie('access_token', opts);
  res.clearCookie('refresh_token', opts);
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    companyName: u.companyName,
    role: u.role,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
  };
}

// =====================================================================
// POST /register
// =====================================================================
router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().isLength({ max: 254 }),
    body('password')
      .isString()
      .isLength({ min: 10, max: 128 })
      .matches(/[A-Z]/).withMessage('Must contain uppercase')
      .matches(/[a-z]/).withMessage('Must contain lowercase')
      .matches(/[0-9]/).withMessage('Must contain a number'),
    body('fullName').optional().isString().trim().isLength({ max: 160 }),
    body('companyName').optional().isString().trim().isLength({ max: 200 }),
    body('phone').optional().isString().trim().isLength({ max: 32 }),
  ],
  asyncHandler(async (req, res) => {
    checkValidation(req);
    const { email, password, fullName, companyName, phone } = req.body;

    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existing.length) {
      throw new AppError('Email is already registered', 409, 'EMAIL_TAKEN');
    }

    const passwordHash = await hashPassword(password);
    const verifyToken = randomToken(32);
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [user] = await db
      .insert(schema.users)
      .values({
        email,
        passwordHash,
        fullName: fullName || null,
        companyName: companyName || null,
        phone: phone || null,
        emailVerifyToken: sha256(verifyToken),
        emailVerifyExpires: verifyExpires,
      })
      .returning();

    // Default free subscription
    await db.insert(schema.subscriptions).values({
      userId: user.id,
      plan: 'free',
      status: 'active',
    });

    // Best-effort email; do not fail the request if it errors.
    try {
      await sendVerificationEmail(user.email, verifyToken);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[register] verification email failed', err.message);
    }

    await auditLog({
      userId: user.id,
      actorEmail: user.email,
      action: 'user.register',
      entityType: 'user',
      entityId: user.id,
      req,
    });

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id, req);
    setAuthCookies(res, { accessToken, refreshToken });

    res.status(201).json({ user: publicUser(user) });
  }),
);

// =====================================================================
// POST /login
// =====================================================================
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 1, max: 128 }),
  ],
  asyncHandler(async (req, res) => {
    checkValidation(req);
    const { email, password } = req.body;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
      .limit(1);

    // Constant-ish messaging to avoid user enumeration.
    const invalid = () => {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    };

    if (!user) {
      // Run a dummy compare to flatten timing.
      await verifyPassword(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
      invalid();
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new AppError('Account temporarily locked. Try again later.', 423, 'ACCOUNT_LOCKED');
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const newCount = (user.failedLoginCount || 0) + 1;
      const lockedUntil =
        newCount >= MAX_FAILED_LOGINS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
          : null;
      await db
        .update(schema.users)
        .set({ failedLoginCount: newCount, lockedUntil })
        .where(eq(schema.users.id, user.id));

      await auditLog({
        userId: user.id,
        actorEmail: user.email,
        action: 'user.login_failed',
        entityType: 'user',
        entityId: user.id,
        req,
        metadata: { failedLoginCount: newCount },
      });
      invalid();
    }

    await db
      .update(schema.users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(schema.users.id, user.id));

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id, req);
    setAuthCookies(res, { accessToken, refreshToken });

    await auditLog({
      userId: user.id,
      actorEmail: user.email,
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
      req,
    });

    res.json({ user: publicUser(user) });
  }),
);

// =====================================================================
// POST /logout
// =====================================================================
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      const hash = sha256(refreshToken);
      await db
        .update(schema.sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.sessions.refreshTokenHash, hash), isNull(schema.sessions.revokedAt)));
    }
    clearAuthCookies(res);
    res.json({ success: true });
  }),
);

// =====================================================================
// POST /refresh  — rotate refresh token + issue new access token
// =====================================================================
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new AppError('Missing refresh token', 401, 'NO_REFRESH_TOKEN');
    }
    const hash = sha256(refreshToken);

    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.refreshTokenHash, hash),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!session) {
      clearAuthCookies(res);
      throw new AppError('Invalid or expired session', 401, 'INVALID_REFRESH');
    }

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, session.userId), isNull(schema.users.deletedAt)))
      .limit(1);

    if (!user) {
      clearAuthCookies(res);
      throw new AppError('User no longer exists', 401, 'USER_GONE');
    }

    // Rotate: revoke old, issue new.
    await db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.id, session.id));

    const newRefresh = await issueRefreshToken(user.id, req);
    const newAccess = signAccessToken(user);
    setAuthCookies(res, { accessToken: newAccess, refreshToken: newRefresh });

    res.json({ user: publicUser(user) });
  }),
);

// =====================================================================
// POST /forgot-password
// =====================================================================
router.post(
  '/forgot-password',
  passwordLimiter,
  [body('email').isEmail().normalizeEmail()],
  asyncHandler(async (req, res) => {
    checkValidation(req);
    const { email } = req.body;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
      .limit(1);

    // Always respond 200 to avoid leaking which emails are registered.
    if (user) {
      const token = randomToken(32);
      await db
        .update(schema.users)
        .set({
          resetToken: sha256(token),
          resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
        })
        .where(eq(schema.users.id, user.id));

      try {
        await sendPasswordResetEmail(user.email, token);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[forgot-password] email failed', err.message);
      }

      await auditLog({
        userId: user.id,
        actorEmail: user.email,
        action: 'user.password_reset_requested',
        entityType: 'user',
        entityId: user.id,
        req,
      });
    }

    res.json({ success: true });
  }),
);

// =====================================================================
// POST /reset-password
// =====================================================================
router.post(
  '/reset-password',
  passwordLimiter,
  [
    body('token').isString().isLength({ min: 16, max: 256 }),
    body('password')
      .isString()
      .isLength({ min: 10, max: 128 })
      .matches(/[A-Z]/).matches(/[a-z]/).matches(/[0-9]/),
  ],
  asyncHandler(async (req, res) => {
    checkValidation(req);
    const { token, password } = req.body;
    const hash = sha256(token);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.resetToken, hash), gt(schema.users.resetTokenExpires, new Date())))
      .limit(1);

    if (!user) {
      throw new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN');
    }

    const passwordHash = await hashPassword(password);
    await db
      .update(schema.users)
      .set({
        passwordHash,
        resetToken: null,
        resetTokenExpires: null,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      .where(eq(schema.users.id, user.id));

    // Revoke all existing sessions; password changed.
    await db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.userId, user.id), isNull(schema.sessions.revokedAt)));

    await auditLog({
      userId: user.id,
      actorEmail: user.email,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: user.id,
      req,
    });

    res.json({ success: true });
  }),
);

// =====================================================================
// POST /verify-email
// =====================================================================
router.post(
  '/verify-email',
  authLimiter,
  [body('token').isString().isLength({ min: 16, max: 256 })],
  asyncHandler(async (req, res) => {
    checkValidation(req);
    const { token } = req.body;
    const hash = sha256(token);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(
        and(eq(schema.users.emailVerifyToken, hash), gt(schema.users.emailVerifyExpires, new Date())),
      )
      .limit(1);

    if (!user) {
      throw new AppError('Invalid or expired verification token', 400, 'INVALID_VERIFY_TOKEN');
    }

    await db
      .update(schema.users)
      .set({ emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null })
      .where(eq(schema.users.id, user.id));

    await auditLog({
      userId: user.id,
      actorEmail: user.email,
      action: 'user.email_verified',
      entityType: 'user',
      entityId: user.id,
      req,
    });

    res.json({ success: true });
  }),
);

export default router;
