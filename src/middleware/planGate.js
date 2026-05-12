// src/middleware/planGate.js

import redis from '../lib/redis.js';
import User from '../models/User.js';
import AiUsageLog from '../models/AiUsageLog.js';

const PLAN_LEVELS = { free: 0, professional: 1, business: 2 };
const CACHE_TTL = 300; // 5 minutes

/**
 * Get the effective plan for a user, using Redis cache (key: plan:{userId}).
 * Automatically downgrades to 'free' if subscription expired or cancelled past period end.
 */
async function getUserEffectivePlan(userId) {
  const cacheKey = `plan:${userId}`;

  // Try cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached && PLAN_LEVELS[cached] !== undefined) {
      return cached;
    }
  } catch (_) {
    // Redis error – fall through to DB
  }

  // Fetch user subscription from DB
  let effectivePlan = 'free';
  try {
    const user = await User.findById(userId).select('subscription').lean();
    if (user?.subscription) {
      const sub = user.subscription;
      const now = new Date();

      // Downgrade if period ended (expired) or cancelled with past period end
      const periodEnded =
        sub.currentPeriodEnd && now > new Date(sub.currentPeriodEnd);
      if (periodEnded) {
        effectivePlan = 'free';
      } else {
        effectivePlan = sub.plan || 'free';
      }
    }
  } catch (_) {
    // DB error – treat as free
  }

  // Cache the resolved plan
  try {
    await redis.set(cacheKey, effectivePlan, 'EX', CACHE_TTL);
  } catch (_) {
    // ignore cache write failures
  }

  return effectivePlan;
}

/**
 * Middleware factory: require a minimum plan level.
 * @param {"free"|"professional"|"business"} minPlan
 */
export function requirePlan(minPlan) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const currentPlan = await getUserEffectivePlan(userId);
      const currentLevel = PLAN_LEVELS[currentPlan] ?? 0;
      const requiredLevel = PLAN_LEVELS[minPlan] ?? 0;

      if (currentLevel < requiredLevel) {
        return res.status(403).json({
          error: 'upgrade_required',
          required_plan: minPlan,
          upgrade_url: '/pricing',
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Log an AI feature usage event.
 */
async function logAiUsage(userId, feature) {
  await AiUsageLog.create({
    user_id: userId,
    feature,
    createdAt: new Date(),
  });
}

/**
 * Count usage of a feature by a user for the current calendar month.
 */
async function countCurrentMonthUsage(userId, feature) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return AiUsageLog.countDocuments({
    user_id: userId,
    feature,
    createdAt: { $gte: monthStart, $lt: nextMonthStart },
  });
}

/**
 * Middleware factory: gate AI features by usage limits per plan.
 * @param {"pfma_chat"|"win_probability"|"compliance_check"|"drafter"} featureName
 */
export function aiGate(featureName) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const plan = await getUserEffectivePlan(userId);

      // Business plan – unlimited
      if (plan === 'business') {
        await logAiUsage(userId, featureName);
        return next();
      }

      // Professional plan – unlimited except drafter (max 10)
      if (plan === 'professional') {
        if (featureName !== 'drafter') {
          await logAiUsage(userId, featureName);
          return next();
        }
        // drafter limit 10
        const count = await countCurrentMonthUsage(userId, featureName);
        if (count >= 10) {
          const now = new Date();
          const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          return res.status(429).json({
            error: 'limit_reached',
            limit: 10,
            reset_date: resetDate.toISOString(),
            upgrade_url: '/pricing',
          });
        }
        await logAiUsage(userId, featureName);
        return next();
      }

      // Free plan – max 3 per feature
      const count = await countCurrentMonthUsage(userId, featureName);
      if (count >= 3) {
        const now = new Date();
        const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return res.status(429).json({
          error: 'limit_reached',
          limit: 3,
          reset_date: resetDate.toISOString(),
          upgrade_url: '/pricing',
        });
      }

      await logAiUsage(userId, featureName);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Strips sensitive fields from the tender object for free-plan users.
 */
function stripFreeFields(tender) {
  const fieldsToRemove = [
    'contact_details',
    'full_description',
    'documents',
    'evaluator_notes',
    'budget_breakdown',
  ];
  for (const field of fieldsToRemove) {
    delete tender[field];
  }
}

/**
 * Middleware that conditions the tender response based on the user's plan.
 * Assumes the tender object is placed in `res.locals.tender` before this middleware runs.
 */
export async function tenderGate(req, res, next) {
  try {
    const userId = req.user?.id;
    let plan = 'free';

    if (userId) {
      plan = await getUserEffectivePlan(userId);
    }

    // Paid plans see the full object
    if (plan === 'professional' || plan === 'business') {
      return next();
    }

    // Free (or unauthenticated) – strip sensitive fields
    if (res.locals.tender) {
      stripFreeFields(res.locals.tender);
    }

    next();
  } catch (err) {
    next(err);
  }
}