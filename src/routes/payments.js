const express = require('express');
const crypto = require('crypto');
const https = require('https');
const router = express.Router();

// Assume these are already set up in the main app
const pool = require('../db');            // pg Pool
const auth = require('../middleware/auth'); // JWT verification (sets req.user)

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Sorts the fields alphabetically, URL‑encodes keys and values,
 * then creates the MD5 signature required by PayFast.
 */
function generatePayFastSignature(data, passphrase) {
  // Exclude the 'signature' field itself
  const fields = { ...data };
  delete fields.signature;

  const sortedKeys = Object.keys(fields).sort();

  const encodedPairs = sortedKeys.map((key) => {
    const encodedKey = encodeURIComponent(key);
    // PayFast expects values to be encoded (spaces become %20, etc.)
    const encodedValue = encodeURIComponent(String(fields[key]));
    return `${encodedKey}=${encodedValue}`;
  });

  const queryString = encodedPairs.join('&');
  const signatureString = queryString + `&passphrase=${encodeURIComponent(passphrase)}`;

  return crypto.createHash('md5').update(signatureString).digest('hex');
}

/**
 * Verifies the received ITN signature against our passphrase.
 */
function verifyPayFastSignature(data, passphrase) {
  const receivedSig = data.signature;
  if (!receivedSig) return false;
  const computedSig = generatePayFastSignature(data, passphrase);
  return receivedSig === computedSig;
}

/**
 * Performs PayFast server validation (GET /eng/query/validate).
 * Returns a Promise that resolves to true if the payment is valid.
 */
function serverValidate(data, baseUrl) {
  return new Promise((resolve, reject) => {
    // Reconstruct query string exactly as received (including signature)
    const params = new URLSearchParams(data).toString();
    const url = `${baseUrl}/eng/query/validate?${params}`;

    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve(body.trim() === 'VALID');
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('PayFast validation timeout'));
    });
  });
}

// ----------------------------------------------------------------------
// 1. POST /api/v1/payments/create-checkout
// ----------------------------------------------------------------------
router.post('/create-checkout', auth, async (req, res) => {
  try {
    const { plan_id, billing } = req.body;

    // Validate input
    const validPlans = ['professional', 'business'];
    const validBilling = ['monthly', 'annual'];
    if (!validPlans.includes(plan_id)) {
      return res.status(400).json({ error: 'Invalid plan_id. Must be "professional" or "business".' });
    }
    if (!validBilling.includes(billing)) {
      return res.status(400).json({ error: 'Invalid billing. Must be "monthly" or "annual".' });
    }

    // Fetch monthly price from the plans table
    const planResult = await pool.query('SELECT monthly_price FROM plans WHERE id = $1', [plan_id]);
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const monthlyPrice = parseFloat(planResult.rows[0].monthly_price);
    const amount = billing === 'annual' ? monthlyPrice * 10 : monthlyPrice;
    const amountFormatted = amount.toFixed(2);

    // Generate unique payment ID
    const m_payment_id = crypto.randomUUID();

    // Insert a pending subscription record for later activation by webhook
    const subscriptionInsert = await pool.query(
      `INSERT INTO subscriptions
         (user_id, plan_id, status, billing_period, amount, m_payment_id, cancel_at_period_end)
       VALUES ($1, $2, 'pending', $3, $4, $5, false)
       RETURNING id, created_at`,
      [req.user.id, plan_id, billing, amount, m_payment_id]
    );

    // Build PayFast payment object
    const isSandbox = process.env.PAYFAST_SANDBOX === 'true';
    const baseUrl = isSandbox ? 'https://sandbox.payfast.co.za' : 'https://www.payfast.co.za';
    const returnUrl = `${process.env.APP_URL}/payment/return`;
    const cancelUrl = `${process.env.APP_URL}/payment/cancel`;
    const notifyUrl = `${process.env.APP_URL}/api/v1/payments/webhook`;

    // Today's date in YYYY-MM-DD
    const today = new Date().toISOString().slice(0, 10);

    // Frequency mapping
    const frequency = billing === 'monthly' ? 3 : 6;   // 3=monthly, 6=yearly
    const recurringAmount = billing === 'monthly' ? monthlyPrice.toFixed(2) : amountFormatted;

    const payfastFields = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      name_first: req.user.first_name || 'User',
      name_last: req.user.last_name || '',
      email_address: req.user.email,
      m_payment_id,
      amount: amountFormatted,
      item_name: `Tenderpreneurs ${plan_id} ${billing} subscription`,
      subscription_type: '1',         // recurring billing
      billing_date: today,
      recurring_amount: recurringAmount,
      frequency: String(frequency),
      cycles: '0',                    // indefinite
      subscription_notify_email: 'true',
    };

    // Generate signature
    const signature = generatePayFastSignature(payfastFields, process.env.PAYFAST_PASSPHRASE);
    payfastFields.signature = signature;

    return res.json({
      action_url: `${baseUrl}/eng/process`,
      fields: payfastFields,
    });
  } catch (err) {
    console.error('Create checkout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------------------
// 2. POST /api/v1/payments/webhook  (no auth)
// ----------------------------------------------------------------------
router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  // PayFast expects plain-text 200 OK
  const logEntry = {
    subscription_id: null,
    event_type: 'webhook_received',
    raw_body: req.body,
    outcome: 'received',
    created_at: new Date().toISOString(),
  };

  try {
    // Log EVERY event immediately (before validation)
    await pool.query(
      `INSERT INTO payment_events (subscription_id, event_type, raw_body, outcome, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [null, 'webhook_received', req.body, 'received', logEntry.created_at]
    );

    const data = req.body;
    const m_payment_id = data.m_payment_id;
    if (!m_payment_id) {
      // No payment ID, still return 200 to prevent retries
      return res.status(200).send('OK');
    }

    // Look up the matching pending subscription
    const subRes = await pool.query(
      'SELECT * FROM subscriptions WHERE m_payment_id = $1 AND status = $2',
      [m_payment_id, 'pending']
    );
    if (subRes.rows.length === 0) {
      // Unknown or already processed payment
      await pool.query(
        'INSERT INTO payment_events (subscription_id, event_type, raw_body, outcome) VALUES ($1,$2,$3,$4)',
        [null, 'webhook_unknown', req.body, 'unknown_subscription']
      );
      return res.status(200).send('OK');
    }

    const subscription = subRes.rows[0];
    logEntry.subscription_id = subscription.id;

    // 1. Signature verification
    const isSandbox = process.env.PAYFAST_SANDBOX === 'true';
    const signatureValid = verifyPayFastSignature(data, process.env.PAYFAST_PASSPHRASE);

    if (!signatureValid) {
      await pool.query(
        'INSERT INTO payment_events (subscription_id, event_type, raw_body, outcome) VALUES ($1,$2,$3,$4)',
        [subscription.id, 'webhook_invalid_signature', req.body, 'invalid_signature']
      );
      return res.status(200).send('OK');
    }

    // 2. Amount verification
    const expectedAmount = parseFloat(subscription.amount).toFixed(2);
    const receivedAmount = parseFloat(data.amount_gross).toFixed(2);
    const amountValid = expectedAmount === receivedAmount;

    if (!amountValid) {
      await pool.query(
        'INSERT INTO payment_events (subscription_id, event_type, raw_body, outcome) VALUES ($1,$2,$3,$4)',
        [subscription.id, 'webhook_amount_mismatch', req.body, 'amount_mismatch']
      );
      return res.status(200).send('OK');
    }

    // 3. Server validation via PayFast's validate endpoint
    const baseUrl = isSandbox ? 'https://sandbox.payfast.co.za' : 'https://www.payfast.co.za';
    let serverValid = false;
    try {
      serverValid = await serverValidate(data, baseUrl);
    } catch (err) {
      console.error('PayFast server validation error:', err);
    }

    if (!serverValid) {
      await pool.query(
        'INSERT INTO payment_events (subscription_id, event_type, raw_body, outcome) VALUES ($1,$2,$3,$4)',
        [subscription.id, 'webhook_server_invalid', req.body, 'server_validation_failed']
      );
      return res.status(200).send('OK');
    }

    // 4. Payment must be complete
    if (data.payment_status !== 'COMPLETE') {
      await pool.query(
        'INSERT INTO payment_events (subscription_id, event_type, raw_body, outcome) VALUES ($1,$2,$3,$4)',
        [subscription.id, 'webhook_not_complete', req.body, `status_${data.payment_status}`]
      );
      return res.status(200).send('OK');
    }

    // 5. Activate subscription
    const startDate = new Date();
    let endDate;
    if (subscription.billing_period === 'monthly') {
      endDate = new Date(startDate.setMonth(startDate.getMonth() + 1));
    } else {
      endDate = new Date(startDate.setFullYear(startDate.getFullYear() + 1));
    }

    await pool.query(
      `UPDATE subscriptions
       SET plan_id = $1,
           status = 'active',
           payfast_token = $2,
           current_period_start = $3,
           current_period_end = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [subscription.plan_id, data.token, startDate.toISOString(), endDate.toISOString(), subscription.id]
    );

    // Insert completion event
    await pool.query(
      'INSERT INTO payment_events (subscription_id, event_type, raw_body, outcome) VALUES ($1,$2,$3,$4)',
      [subscription.id, 'payment_completed', req.body, 'activated']
    );

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook processing error:', err);
    // Log the exception
    try {
      await pool.query(
        'INSERT INTO payment_events (subscription_id, event_type, raw_body, outcome) VALUES ($1,$2,$3,$4)',
        [logEntry.subscription_id, 'webhook_error', req.body, 'exception']
      );
    } catch (_) {}
    return res.status(200).send('OK'); // still return 200 to satisfy PayFast
  }
});

// ----------------------------------------------------------------------
// 3. POST /api/v1/payments/cancel
// ----------------------------------------------------------------------
router.post('/cancel', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE subscriptions
       SET cancel_at_period_end = true,
           updated_at = NOW()
       WHERE user_id = $1
         AND status = 'active'
       RETURNING id, plan_id, current_period_end`,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    return res.json({
      success: true,
      message: 'Subscription will be cancelled at the end of the current billing period.',
      current_period_end: result.rows[0].current_period_end,
    });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------------------
// 4. GET /api/v1/payments/status
// ----------------------------------------------------------------------
router.get('/status', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT plan_id, status, current_period_end, cancel_at_period_end
       FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        has_subscription: false,
        plan: null,
        period_end: null,
        cancel_scheduled: false,
      });
    }

    const sub = result.rows[0];
    return res.json({
      has_subscription: true,
      plan: sub.plan_id,
      period_end: sub.current_period_end,
      cancel_scheduled: sub.cancel_at_period_end,
    });
  } catch (err) {
    console.error('Status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;