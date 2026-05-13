const ical = require('ical-generator');
const db = require('../db');

async function generateIcalFeed(token) {
  // 1. Find user by ical_feed_token
  const { rows: userRows } = await db.query(
    'SELECT id FROM users WHERE ical_feed_token = $1',
    [token]
  );
  if (!userRows[0]) throw new Error('Invalid token');
  const userId = userRows[0].id;

  // 2. Get all pipeline items (assuming a pipeline table)
  const { rows: tenders } = await db.query(
    `SELECT t.* FROM tenders t
     JOIN pipeline p ON t.id = p.tender_id
     WHERE p.user_id = $1`,
    [userId]
  );

  // 3. Build iCal feed
  const cal = ical({
    name: 'TenderPipeline Calendar',
    ttl: 3600, // 1 hour refresh
    method: 'PUBLISH',
  });

  for (const tender of tenders) {
    // Briefing
    if (tender.briefing_date) {
      const start = new Date(tender.briefing_date);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1h
      cal.createEvent({
        start,
        end,
        summary: `Tender Briefing - ${tender.title}`,
        description: tender.description || '',
        location: tender.briefing_venue || tender.briefing_virtual_link || '',
        uid: `tender-${tender.id}-briefing@tenderpreneurs.co.za`,
        alarms: [{ type: 'display', trigger: 86400 }], // 1 day before
      });
    }

    // Site visit
    if (tender.site_visit_date) {
      const start = new Date(tender.site_visit_date);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      cal.createEvent({
        start,
        end,
        summary: `Site Visit - ${tender.title}`,
        description: tender.description || '',
        location: tender.site_visit_venue || '',
        uid: `tender-${tender.id}-sitevisit@tenderpreneurs.co.za`,
        alarms: [{ type: 'display', trigger: 86400 }],
      });
    }

    // Closing date (all-day)
    if (tender.closing_date) {
      const closing = new Date(tender.closing_date);
      cal.createEvent({
        start: closing,
        allDay: true,
        summary: `Tender Closes - ${tender.title}`,
        description: `Submission deadline for ${tender.title}`,
        uid: `tender-${tender.id}-closing@tenderpreneurs.co.za`,
        alarms: [{ type: 'display', trigger: 86400 }],
      });
    }
  }

  return cal.toString();
}

module.exports = { generateIcalFeed };