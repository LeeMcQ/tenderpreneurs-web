// src/routes/tenders.js
// GET /api/v1/tenders         — list with filters
// GET /api/v1/tenders/:id     — single tender
//
// Mount with:
//   app.use('/api/v1/tenders', tendersRouter)

import { Router } from 'express';
import { query, param, validationResult } from 'express-validator';
import { and, or, eq, ilike, gte, lte, desc, asc, sql } from 'drizzle-orm';

import { db, schema } from '../db/index.js';
import { verifyToken, tenderGate } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../utils/helpers.js';

const router = Router();

const VALID_SORT = new Set(['closing_date', 'published_date', 'created_at']);
const VALID_ORDER = new Set(['asc', 'desc']);
const VALID_STATUS = new Set(['open', 'closed', 'awarded', 'cancelled']);
const MAX_LIMIT = 100;

function checkValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Invalid query parameters', 422, 'VALIDATION_ERROR');
  }
}

// =====================================================================
// GET /api/v1/tenders
// Filters: province, sector, keyword, closing_date, closing_date_from,
//          closing_date_to, status, min_budget, max_budget,
//          page, limit, sort, order
// =====================================================================
router.get(
  '/',
  verifyToken({ required: false }), // public listing, but plan-aware if logged in
  tenderGate,
  [
    query('province').optional().isString().trim().isLength({ max: 64 }),
    query('sector').optional().isString().trim().isLength({ max: 120 }),
    query('keyword').optional().isString().trim().isLength({ min: 1, max: 200 }),
    query('closing_date').optional().isISO8601(),        // single-day shorthand
    query('closing_date_from').optional().isISO8601(),
    query('closing_date_to').optional().isISO8601(),
    query('status').optional().isIn([...VALID_STATUS]),
    query('min_budget').optional().isFloat({ min: 0 }),
    query('max_budget').optional().isFloat({ min: 0 }),
    query('page').optional().isInt({ min: 1, max: 10_000 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: MAX_LIMIT }).toInt(),
    query('sort').optional().isIn([...VALID_SORT]),
    query('order').optional().isIn([...VALID_ORDER]),
  ],
  asyncHandler(async (req, res) => {
    checkValidation(req);

    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;

    const sortField = req.query.sort || 'closing_date';
    const order = req.query.order || 'asc';

    const filters = [];

    if (req.query.province) {
      filters.push(eq(schema.tenders.province, req.query.province));
    }
    if (req.query.sector) {
      filters.push(eq(schema.tenders.sector, req.query.sector));
    }
    if (req.query.status) {
      filters.push(eq(schema.tenders.status, req.query.status));
    } else {
      // Default: only open tenders on the public listing.
      filters.push(eq(schema.tenders.status, 'open'));
    }
    if (req.query.keyword) {
      const k = `%${req.query.keyword}%`;
      filters.push(
        or(
          ilike(schema.tenders.title, k),
          ilike(schema.tenders.shortDescription, k),
          ilike(schema.tenders.referenceNumber, k),
        ),
      );
    }
    if (req.query.closing_date) {
      // Single day window: tenders closing on that calendar date (UTC).
      const day = new Date(req.query.closing_date);
      const start = new Date(day);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setUTCHours(23, 59, 59, 999);
      filters.push(gte(schema.tenders.closingDate, start));
      filters.push(lte(schema.tenders.closingDate, end));
    }
    if (req.query.closing_date_from) {
      filters.push(gte(schema.tenders.closingDate, new Date(req.query.closing_date_from)));
    }
    if (req.query.closing_date_to) {
      filters.push(lte(schema.tenders.closingDate, new Date(req.query.closing_date_to)));
    }
    if (req.query.min_budget !== undefined) {
      filters.push(gte(schema.tenders.budgetMax, String(req.query.min_budget)));
    }
    if (req.query.max_budget !== undefined) {
      filters.push(lte(schema.tenders.budgetMin, String(req.query.max_budget)));
    }

    const where = filters.length ? and(...filters) : undefined;

    const sortMap = {
      closing_date: schema.tenders.closingDate,
      published_date: schema.tenders.publishedDate,
      created_at: schema.tenders.createdAt,
    };
    const orderBy = order === 'desc' ? desc(sortMap[sortField]) : asc(sortMap[sortField]);

    const rowsPromise = db
      .select()
      .from(schema.tenders)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const countPromise = db
      .select({ count: sql`count(*)::int` })
      .from(schema.tenders)
      .where(where);

    const [rows, [{ count }]] = await Promise.all([rowsPromise, countPromise]);

    res.json({
      tenders: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit)),
        hasNext: offset + rows.length < count,
        hasPrev: page > 1,
      },
      filters: {
        province: req.query.province || null,
        sector: req.query.sector || null,
        keyword: req.query.keyword || null,
        status: req.query.status || 'open',
      },
    });
  }),
);

// =====================================================================
// GET /api/v1/tenders/:id
// =====================================================================
router.get(
  '/:id',
  verifyToken({ required: false }),
  tenderGate,
  [param('id').isUUID()],
  asyncHandler(async (req, res) => {
    checkValidation(req);

    const [tender] = await db
      .select()
      .from(schema.tenders)
      .where(eq(schema.tenders.id, req.params.id))
      .limit(1);

    if (!tender) {
      throw new AppError('Tender not found', 404, 'TENDER_NOT_FOUND');
    }
    res.json({ tender });
  }),
);

export default router;
