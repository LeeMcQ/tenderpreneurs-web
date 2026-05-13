// awardsImporter.js
// Cron job: fetches tender awards from public sources every 6 hours.
// Also registers a manual import endpoint for admin use.

const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const db = require('../db');                          // your database module (pg pool, knex, etc.)
const { checkCompetitorAlerts } = require('../services/competitorAlerts');

// ---- Scraping helpers ----

/**
 * Scrape awards from etenders.gov.za "Awarded Tenders" page.
 * Returns array of award objects: { referenceNumber, winnerName, winnerReg, value, date, raw }
 */
async function scrapeETendersAwards() {
  // TODO: Replace with actual scraping logic. This is a skeleton using cheerio.
  const url = 'https://www.etenders.gov.za/Home/Awards';
  const { data } = await axios.get(url, { timeout: 15000 });
  const $ = cheerio.load(data);
  const awards = [];

  $('table.awards tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;
    awards.push({
      referenceNumber: $(cells[0]).text().trim(),
      winnerName: $(cells[1]).text().trim(),
      winnerReg: $(cells[2]).text().trim() || null,
      value: parseAmount($(cells[3]).text().trim()),
      date: parseDate($(cells[4]).text().trim()),
      raw: { source: 'etenders', html: $(row).html() }
    });
  });
  return awards;
}

/**
 * Parse RSS feed of Government Gazette tender notices.
 * Returns array of award objects extracted from items that contain an award.
 */
async function fetchGazetteAwards() {
  const parser = new Parser();
  const feed = await parser.parseURL('https://www.gov.za/documents/governmentgazette');
  const awards = [];

  for (const item of feed.items) {
    // Attempt to extract award info from the item title/content.
    // This is a simplified extraction; real logic would use regex/NLP.
    const award = extractAwardFromGazetteItem(item);
    if (award) {
      awards.push({ ...award, raw: { source: 'gazette', feedItem: item } });
    }
  }
  return awards;
}

// ---- Utility functions (to be implemented per actual website) ----
function parseAmount(text) { /* parse 'R 1,234,567.89' to bigint */ return 0; }
function parseDate(text) { /* parse '2023-06-15' */ return '2023-01-01'; }
function extractAwardFromGazetteItem(item) { /* dummy */ return null; }

// ---- Core import logic ----

/**
 * Import a single award record, matching it to an existing tender.
 * Skips duplicates (ON CONFLICT on unique_tender_award).
 * Then triggers competitor alert check.
 */
async function importAward(awardData) {
  const { referenceNumber, winnerName, winnerReg, value, date, raw } = awardData;

  // Find tender by reference number (assumes tenders table has reference_number column)
  const tenders = await db.query(
    'SELECT id FROM tenders WHERE reference_number = $1 LIMIT 1',
    [referenceNumber]
  );
  if (tenders.rows.length === 0) {
    console.log(`No tender found for reference: ${referenceNumber}`);
    return false;
  }

  const tenderId = tenders.rows[0].id;

  // Insert award; skip if duplicate exists (unique_tender_award constraint)
  const insertResult = await db.query(
    `INSERT INTO tender_awards 
       (tender_id, winner_name, winner_registration, award_value_zar, award_date, source, raw_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ON CONSTRAINT unique_tender_award DO NOTHING
     RETURNING id`,
    [tenderId, winnerName, winnerReg, value, date, raw.source || 'etenders', JSON.stringify(raw)]
  );

  if (insertResult.rows.length > 0) {
    const awardId = insertResult.rows[0].id;
    console.log(`New award imported: ID ${awardId} for tender ${tenderId}`);
    // Trigger competitor alert check asynchronously
    checkCompetitorAlerts(awardId).catch(err =>
      console.error('Alert check error:', err)
    );
    return true;
  }
  return false; // duplicate skipped
}

// ---- Cron job ----

/**
 * Main job: scrape all sources and import awards.
 */
async function runImportJob() {
  console.log('Starting awards import job...');
  try {
    const [etendersAwards, gazetteAwards] = await Promise.all([
      scrapeETendersAwards(),
      fetchGazetteAwards()
    ]);

    const allAwards = [...etendersAwards, ...gazetteAwards];
    let imported = 0;
    for (const award of allAwards) {
      if (await importAward(award)) imported++;
    }
    console.log(`Import job finished. New awards: ${imported}/${allAwards.length}`);
  } catch (error) {
    console.error('Awards import job failed:', error);
  }
}

// ---- Manual import endpoint (admin only) ----

/**
 * Express middleware to handle manual award addition.
 * Attached to the main app in initAwardsImporter().
 */
async function manualImportHandler(req, res) {
  try {
    const { tender_id, winner_name, value, date } = req.body;
    if (!tender_id || !winner_name || !value || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const raw = { source: 'manual', submitted_by: req.user?.id, timestamp: new Date() };
    const award = {
      referenceNumber: null, // we already have tender_id
      winnerName: winner_name,
      winnerReg: req.body.winner_registration || null,
      value: BigInt(value),
      date,
      raw
    };

    // Directly insert using the provided tender_id
    const insertResult = await db.query(
      `INSERT INTO tender_awards 
         (tender_id, winner_name, winner_registration, award_value_zar, award_date, source, raw_data)
       VALUES ($1, $2, $3, $4, $5, 'manual', $6)
       ON CONFLICT ON CONSTRAINT unique_tender_award DO NOTHING
       RETURNING id`,
      [tender_id, award.winnerName, award.winnerReg, award.value, award.date, JSON.stringify(raw)]
    );

    if (insertResult.rows.length > 0) {
      const awardId = insertResult.rows[0].id;
      checkCompetitorAlerts(awardId).catch(err => console.error(err));
      return res.status(201).json({ message: 'Award added', award_id: awardId });
    } else {
      return res.status(409).json({ error: 'Duplicate award already exists' });
    }
  } catch (error) {
    console.error('Manual import error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---- Initialise module: start cron and register route ----

/**
 * Must be called during server startup.
 * @param {Express} app
 */
function initAwardsImporter(app) {
  // Schedule cron job every 6 hours
  cron.schedule('0 */6 * * *', () => {
    runImportJob();
  });
  console.log('Awards importer cron scheduled every 6 hours.');

  // Admin manual import route
  app.post('/api/v1/admin/awards/manual', manualImportHandler);

  // Optional: run initial import on startup (in background)
  // runImportJob();
}

module.exports = { initAwardsImporter, runImportJob };