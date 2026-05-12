// src/middleware/auth.js
// Authentication + authorization middlewares for tenderpreneurs.co.za.

import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { redis } from '../db/redis.js';
import { AppError, verifyAccessToken } from '../utils/helpers.js';

// ---------- Plan rank (higher number = more entitlements) ----------
const PLAN_RANK = { free: 0, starter: 1, pro: 2, enterprise: 3 };

// ---------- Fields stripped from tender responses for free users ----------
const PREMIUM_TENDER_FIELDS = ['contactDetails', 'fullDescription', 'documents'];
// Also strip snake_case mirrors in case raw rows are passed through.
const PREMIUM_TENDER_FIELDS_SNAKE = ['contact_details', 'full_description', 'documents'];

// =====================================================================
// verifyToken
// Validates the JWT access token from Authorization header or cookie,
// loads the active subscription, attaches { req.user, req.subscription }.
// =====================================================================
export function verifyToken({ required = true } = {}) {
  return async function verifyTokenMiddleware(req, res, next) {
    try {
      const header = req.get('authorization') || '';
      const bearer = header.toLowerCase().startsWith('bearer ')
        ? header.slice(7).trim()
        : null;
      const token = bearer || req.cookies?.access_token;

      if (!token) {
        if (!required) return next();
        throw new AppError('Authentication required', 401, 'NO_TOKEN');
      }

      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch (err) {
        if (!required) return next();
        const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
        throw new AppError('Invalid or expired token', 401, code);
      }

      // Optional Redis blacklist (e.g. forced logout-all). Best-effort.
      try {
        const blacklisted = await redis.get(`bl:jwt:${payload.jti || payload.sub}`);
        if (blacklisted) {
          throw new AppError('Token revoked', 401, 'TOKEN_REVOKED');
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        // If Redis is down, do not block authenticated requests.
      }

      const [user] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          role: schema.users.role,
          emailVerified: schema.users.emailVerified,
          fullName: schema.users.fullName,
          companyName: schema.users.companyName,
          deletedAt: schema.users.deletedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, payload.sub))
        .limit(1);

      if (!user || user.deletedAt) {
        throw new AppError('User not found', 401, 'USER_NOT_FOUND');
      }

      // Load active subscription (one of trialing/active/past_due).
      const [sub] = await db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.userId, user.id),
            inArray(schema.subscriptions.status, ['trialing', 'active', 'past_due']),
          ),
        )
        .limit(1);

      req.user = user;
      req.subscription = sub || { plan: 'free', status: 'active' };
      req.plan = req.subscription.plan;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// =====================================================================
// tenderGate
// Wraps res.json so any tender object(s) being sent get premium fields
// stripped for users on the 'free' plan.
// Works whether the response shape is:
//   { tender: {...} }
//   { tenders: [...], pagination: {...} }
//   { data: [...] }  or  [...]
// =====================================================================
export function tenderGate(req, res, next) {
  const plan = req.plan || req.subscription?.plan || 'free';
  const isFree = plan === 'free';

  if (!isFree) return next();

  function strip(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const cleaned = { ...obj };
    for (const f of PREMIUM_TENDER_FIELDS) {
      if (f in cleaned) cleaned[f] = null;
    }
    for (const f of PREMIUM_TENDER_FIELDS_SNAKE) {
      if (f in cleaned) cleaned[f] = null;
    }
    cleaned._gated = true;
    cleaned._gatedFields = [...PREMIUM_TENDER_FIELDS];
    return cleaned;
  }

  function looksLikeTender(o) {
    return (
      o &&
      typeof o === 'object' &&
      ('referenceNumber' in o ||
        'reference_number' in o ||
        'fullDescription' in o ||
        'full_description' in o ||
        'contactDetails' in o ||
        'contact_details' in o)
    );
  }

  function transform(payload) {
    if (Array.isArray(payload)) {
      return payload.map((x) => (looksLikeTender(x) ? strip(x) : x));
    }
    if (payload && typeof payload === 'object') {
      const out = { ...payload };
      if (Array.isArray(out.tenders)) out.tenders = out.tenders.map(strip);
      if (Array.isArray(out.data) && out.data.every(looksLikeTender)) {
        out.data = out.data.map(strip);
      }
      if (out.tender && looksLikeTender(out.tender)) out.tender = strip(out.tender);
      if (looksLikeTender(out) && !out.tenders && !out.data && !out.tender) {
        return strip(out);
      }
      return out;
    }
    return payload;
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(transform(body));

  return next();
}

// =====================================================================
// planGate
// Blocks the route unless the user is on (or above) one of the required plans.
//
//   router.post('/ai/bid-writer', verifyToken(), planGate(['pro','enterprise']), handler)
//
// Accepts a string ('pro') or an array of allowed plans.
// =====================================================================
export function planGate(allowed) {
  const allowedList = Array.isArray(allowed) ? allowed : [allowed];
  const minRank = Math.min(...allowedList.map((p) => PLAN_RANK[p] ?? Infinity));

  if (!isFinite(minRank)) {
    throw new Error(`planGate: unknown plan in ${JSON.stringify(allowedList)}`);
  }

  return function planGateMiddleware(req, res, next) {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'NO_USER'));
    }
    const sub = req.subscription || { plan: 'free', status: 'active' };

    // past_due is a soft warning, not a hard block — choose your stance.
    if (sub.status === 'expired' || sub.status === 'canceled') {
      return next(new AppError('Subscription not active', 402, 'SUBSCRIPTION_INACTIVE'));
    }

    const userRank = PLAN_RANK[sub.plan] ?? 0;
    if (userRank < minRank) {
      return next(
        new AppError(
          `This feature requires a ${allowedList.join(' or ')} subscription`,
          402,
          'PLAN_UPGRADE_REQUIRED',
        ),
      );
    }
    return next();
  };
}

export default { verifyToken, tenderGate, planGate };
