// src/routes/ai.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');               // your database module
const auth = require('../middleware/auth');
const planGate = require('../middleware/planGate');

const router = express.Router();

// -------------------------------------------------------------------
// Anthropic Claude Haiku client setup
// -------------------------------------------------------------------
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// -------------------------------------------------------------------
// Rate limiter for PFMA chat (20 requests per hour per IP)
// -------------------------------------------------------------------
const pfmaChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 20,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// -------------------------------------------------------------------
// Helper: extract JSON from Claude's text response
// -------------------------------------------------------------------
function parseAIJson(text) {
  // Claude sometimes wraps in ```json ... ```
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  return JSON.parse(match[0]);
}

// -------------------------------------------------------------------
// 1. POST /api/v1/ai/pfma-chat
// -------------------------------------------------------------------
router.post(
  '/pfma-chat',
  pfmaChatLimiter,
  [
    body('message')
      .isString()
      .notEmpty()
      .withMessage('Message is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const systemPrompt =
        'You are a South African public procurement compliance expert. ' +
        'Answer questions about PFMA, PPPFA, B-BBEE, CSD registration, and tender procedures. ' +
        'Be concise and cite relevant legislation.';

      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: req.body.message }],
      });

      const answer = response.content[0].text;
      const tokensUsed =
        response.usage.input_tokens + response.usage.output_tokens;

      // Track usage in ai_usage_log table
      await db.query(
        `INSERT INTO ai_usage_log (user_id, endpoint, tokens_used, ip_address, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [null, 'pfma-chat', tokensUsed, req.ip]
      );

      // Remaining free calls come from the rate limiter
      const remaining = req.rateLimit ? req.rateLimit.remaining : 0;

      return res.json({
        answer,
        tokens_used: tokensUsed,
        remaining_free_calls: remaining,
      });
    } catch (error) {
      console.error('PFMA chat error:', error);
      return res.status(500).json({ error: 'AI service unavailable' });
    }
  }
);

// -------------------------------------------------------------------
// 2. POST /api/v1/ai/win-probability
// -------------------------------------------------------------------
router.post(
  '/win-probability',
  auth,
  planGate('free', 3),   // free plan, 3 requests per day/month
  [
    body('tender_id').isString().notEmpty().withMessage('tender_id is required'),
    body('company_profile')
      .isObject()
      .withMessage('company_profile must be a JSON object'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { tender_id, company_profile } = req.body;

      // Optional: fetch tender details from DB if richer context is needed
      // const tender = await getTenderById(tender_id);

      const prompt =
        `Given a tender with ID ${tender_id} and the following company profile:\n` +
        JSON.stringify(company_profile, null, 2) +
        `\n\nEstimate the probability (0-100) of this company winning that tender. ` +
        `List exactly 3 key factors affecting the outcome. ` +
        `Respond with a JSON object: { "probability": number, "factors": string[] }`;

      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        system:
          'You are a South African tender analysis expert. Provide concise, data-driven assessments.',
        messages: [{ role: 'user', content: prompt }],
      });

      const result = parseAIJson(response.content[0].text);

      return res.json({
        probability: result.probability,
        key_factors: result.factors,
      });
    } catch (error) {
      console.error('Win probability error:', error);
      return res.status(500).json({ error: 'AI service unavailable' });
    }
  }
);

// -------------------------------------------------------------------
// 3. POST /api/v1/ai/compliance-check
// -------------------------------------------------------------------
router.post(
  '/compliance-check',
  auth,
  planGate('free', 3),
  [
    body('tender_id').isString().notEmpty().withMessage('tender_id is required'),
    body('documents')
      .isArray({ min: 1 })
      .withMessage('documents must be a non-empty array'),
    body('documents.*')
      .isString()
      .notEmpty()
      .withMessage('Each document must be a non-empty string'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { tender_id, documents } = req.body;

      // Optional: fetch tender-specific requirements from DB
      // const requirements = await getTenderRequirements(tender_id);

      const docTexts = documents
        .map((doc, idx) => `Document ${idx + 1}:\n${doc}`)
        .join('\n\n');

      const prompt =
        `You are a compliance checker for South African tenders. The tender ID is ${tender_id}.\n` +
        `The following documents have been provided:\n${docTexts}\n\n` +
        `Based on typical tender requirements (valid tax clearance, B-BBEE certificate, CSD registration, etc.), ` +
        `determine for each requirement whether the documents meet it (pass/fail) and provide an overall compliance score from 0 to 100. ` +
        `Respond strictly with a JSON object: { "overall_score": number, "requirements": [{ "name": string, "pass": boolean, "reason": string }] }. ` +
        `Be objective and thorough.`;

      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: 'You are a South African tender compliance expert. Be precise and detailed.',
        messages: [{ role: 'user', content: prompt }],
      });

      const result = parseAIJson(response.content[0].text);

      return res.json({
        overall_score: result.overall_score,
        requirements: result.requirements,
      });
    } catch (error) {
      console.error('Compliance check error:', error);
      return res.status(500).json({ error: 'AI service unavailable' });
    }
  }
);

module.exports = router;