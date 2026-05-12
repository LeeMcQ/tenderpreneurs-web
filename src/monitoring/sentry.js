const Sentry = require("@sentry/node");

// 1. Initialise Sentry early in the app lifecycle
Sentry.init({
  dsn: process.env.SENTRY_DSN_BACKEND,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.2, // 20% of transactions

  // Attach custom tags to events before they are sent.
  // This automatically tags 500 errors on /api/v1/payments/* as payment_critical.
  beforeSend(event, hint) {
    const request = event.request;

    // If the event came from an HTTP request and the response status was 500+,
    // and the URL starts with the payments prefix, add the payment_critical tag.
    if (
      request &&
      request.status_code >= 500 &&
      request.url &&
      request.url.startsWith("/api/v1/payments/")
    ) {
      event.tags = { ...event.tags, type: "payment_critical" };
    }
    return event;
  },
});

// 2. Express middleware that attaches user context to the Sentry scope.
//    Place it AFTER authentication middleware (i.e. after req.user is populated).
function userContextMiddleware(req, res, next) {
  if (req.user) {
    Sentry.setUser({
      id: req.user.id,
      email: req.user.email,
      plan: req.user.plan,
    });
  } else {
    Sentry.setUser(null);
  }
  next();
}

// 3. Sentry's own request handler (creates a dedicated Hub per request).
//    Should be the first middleware added to the Express app.
const requestHandler = Sentry.Handlers.requestHandler();

// 4. Sentry's error handler – required export.
const expressErrorHandler = Sentry.Handlers.errorHandler();

/* ------------------------------------------------------------------ */
/*  Helper functions to manually send tagged events (for custom alerts) */
/* ------------------------------------------------------------------ */

/**
 * Capture a payment‑critical error (e.g. PayFast webhook failure)
 * @param {Error} error
 * @param {object} [extra]   Additional context
 */
function capturePaymentCritical(error, extra = {}) {
  Sentry.withScope((scope) => {
    scope.setTag("type", "payment_critical");
    scope.setExtras(extra);
    Sentry.captureException(error);
  });
}

/**
 * Capture an AI cost alert (usage spike >3x normal)
 * @param {string} message  Descriptive message
 * @param {object} [extra]   Additional context
 */
function captureCostAlert(message, extra = {}) {
  Sentry.withScope((scope) => {
    scope.setTag("type", "cost_alert");
    scope.setExtras(extra);
    Sentry.captureMessage(message, "warning");
  });
}

/**
 * Capture a performance slow alert (DB query >3s)
 * @param {string} message  Descriptive message
 * @param {object} [extra]   Additional context
 */
function capturePerfSlow(message, extra = {}) {
  Sentry.withScope((scope) => {
    scope.setTag("type", "perf_slow");
    scope.setExtras(extra);
    Sentry.captureMessage(message, "warning");
  });
}

module.exports = {
  Sentry,                // re‑export the whole SDK if needed
  requestHandler,       // use: app.use(sentry.requestHandler)
  userContextMiddleware, // use: app.use(sentry.userContextMiddleware) after auth
  expressErrorHandler,  // use: app.use(sentry.expressErrorHandler) (after routes)
  capturePaymentCritical,
  captureCostAlert,
  capturePerfSlow,
};