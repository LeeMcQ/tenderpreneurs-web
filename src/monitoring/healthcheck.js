const express = require("express");

// Internal state – updated by the tender import job
let lastTenderImport = null; // Date object

/**
 * Call this after a successful tender import to update the healthcheck timestamp.
 * @param {Date|string} timestamp
 */
function setLastTenderImport(timestamp) {
  lastTenderImport = timestamp instanceof Date ? timestamp : new Date(timestamp);
}

/**
 * Creates the healthcheck router.
 * @param {object}   opts
 * @param {object}   opts.db    Database client (must support .raw('SELECT 1'))
 * @param {object}   opts.redis Redis client (must support .ping())
 * @returns {express.Router}
 */
function createHealthRouter({ db, redis } = {}) {
  const router = express.Router();

  router.get("/health", async (req, res) => {
    const checks = {
      db: { status: "unknown", responseTime: null },
      redis: { status: "unknown", responseTime: null },
      last_tender_import: lastTenderImport ? lastTenderImport.toISOString() : null,
      uptime: process.uptime(), // seconds
    };

    let overallStatus = "ok";

    // Ping database
    if (db) {
      try {
        const start = Date.now();
        await db.raw("SELECT 1");        // works with Knex, pg, etc.
        checks.db.responseTime = Date.now() - start;
        checks.db.status = "ok";
      } catch (err) {
        checks.db.status = "down";
        overallStatus = "down";
      }
    } else {
      checks.db.status = "down";
      overallStatus = "down";
    }

    // Ping Redis
    if (redis) {
      try {
        const start = Date.now();
        await redis.ping();              // ioredis / node-redis
        checks.redis.responseTime = Date.now() - start;
        checks.redis.status = "ok";
      } catch (err) {
        checks.redis.status = "down";
        overallStatus = "down";
      }
    } else {
      checks.redis.status = "down";
      overallStatus = "down";
    }

    // Degraded if no tender import in the last 24 hours
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (
      overallStatus === "ok" &&
      (!lastTenderImport || Date.now() - lastTenderImport.getTime() > oneDayMs)
    ) {
      overallStatus = "degraded";
    }

    const httpStatus = overallStatus === "down" ? 503 : 200;
    return res.status(httpStatus).json({ status: overallStatus, ...checks });
  });

  return router;
}

module.exports = { createHealthRouter, setLastTenderImport };