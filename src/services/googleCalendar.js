const { google } = require('googleapis');
const db = require('../db'); // Your Postgres pool/connection

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function getAuthUrl(userId) {
  const state = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '10m' });
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
  });
}

async function handleCallback(code, userId) {
  const { tokens } = await oauth2Client.getToken(code);
  // Save tokens to user record
  await db.query(
    `UPDATE users 
     SET google_calendar_token = $1,
         google_calendar_refresh_token = $2,
         calendar_sync_enabled = true
     WHERE id = $3`,
    [tokens.access_token, tokens.refresh_token, userId]
  );
  return tokens;
}

function getClientForUser(tokens) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  return client;
}

async function createEvent(userId, event) {
  const { rows } = await db.query(
    'SELECT google_calendar_token, google_calendar_refresh_token FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]?.google_calendar_token) throw new Error('No Google tokens found');
  const client = getClientForUser({
    access_token: rows[0].google_calendar_token,
    refresh_token: rows[0].google_calendar_refresh_token,
  });
  const calendar = google.calendar({ version: 'v3', auth: client });
  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.start,
      end: event.end,
      reminders: event.reminders || {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 30 }],
      },
    },
  });
  return res.data.id; // Google event ID
}

async function updateEvent(userId, googleEventId, updates) {
  const { rows } = await db.query(
    'SELECT google_calendar_token, google_calendar_refresh_token FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]?.google_calendar_token) throw new Error('No Google tokens found');
  const client = getClientForUser({
    access_token: rows[0].google_calendar_token,
    refresh_token: rows[0].google_calendar_refresh_token,
  });
  const calendar = google.calendar({ version: 'v3', auth: client });
  await calendar.events.patch({
    calendarId: 'primary',
    eventId: googleEventId,
    requestBody: updates,
  });
}

async function deleteEvent(userId, googleEventId) {
  const { rows } = await db.query(
    'SELECT google_calendar_token, google_calendar_refresh_token FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]?.google_calendar_token) return;
  const client = getClientForUser({
    access_token: rows[0].google_calendar_token,
    refresh_token: rows[0].google_calendar_refresh_token,
  });
  const calendar = google.calendar({ version: 'v3', auth: client });
  await calendar.events.delete({
    calendarId: 'primary',
    eventId: googleEventId,
  }).catch(() => {}); // ignore if already deleted
}

async function syncTenderEvents(userId, tenderId) {
  // 1. Delete any previous Google events for this user/tender
  const { rows: existing } = await db.query(
    'SELECT id, google_event_id FROM calendar_events WHERE user_id = $1 AND tender_id = $2',
    [userId, tenderId]
  );
  for (const ev of existing) {
    if (ev.google_event_id) {
      await deleteEvent(userId, ev.google_event_id);
    }
  }
  await db.query(
    'DELETE FROM calendar_events WHERE user_id = $1 AND tender_id = $2',
    [userId, tenderId]
  );

  // 2. Fetch tender details
  const { rows: tenders } = await db.query(
    'SELECT * FROM tenders WHERE id = $1',
    [tenderId]
  );
  if (!tenders[0]) return;
  const tender = tenders[0];

  // Helper to create event and save record
  const createAndSave = async (type, title, description, location, start, end) => {
    try {
      const gEventId = await createEvent(userId, {
        title,
        description: description || '',
        location: location || '',
        start,
        end,
        reminders: type === 'closing'
          ? { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] }
          : undefined,
      });
      await db.query(
        `INSERT INTO calendar_events (user_id, tender_id, event_type, google_event_id, synced_at)
         VALUES ($1, $2, $3, $4, now())`,
        [userId, tenderId, type, gEventId]
      );
    } catch (err) {
      console.error(`Failed to create Google event for ${type}:`, err);
    }
  };

  // Briefing
  if (tender.briefing_date) {
    const start = new Date(tender.briefing_date);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour
    await createAndSave(
      'briefing',
      `Tender Briefing - ${tender.title}`,
      tender.description,
      tender.briefing_venue || tender.briefing_virtual_link || '',
      { dateTime: start.toISOString(), timeZone: 'Africa/Johannesburg' },
      { dateTime: end.toISOString(), timeZone: 'Africa/Johannesburg' }
    );
  }

  // Site visit
  if (tender.site_visit_date) {
    const start = new Date(tender.site_visit_date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await createAndSave(
      'site_visit',
      `Site Visit - ${tender.title}`,
      tender.description,
      tender.site_visit_venue || '',
      { dateTime: start.toISOString(), timeZone: 'Africa/Johannesburg' },
      { dateTime: end.toISOString(), timeZone: 'Africa/Johannesburg' }
    );
  }

  // Closing date – all-day event with 30min popup reminder
  if (tender.closing_date) {
    const closing = new Date(tender.closing_date);
    const dateStr = closing.toISOString().split('T')[0];
    await createAndSave(
      'closing',
      `Tender Closes - ${tender.title}`,
      `Submission deadline for ${tender.title}`,
      '',
      { date: dateStr },
      { date: dateStr }
    );
  }

  // Submission reminder 3 days before closing
  if (tender.closing_date) {
    const closing = new Date(tender.closing_date);
    const reminderDate = new Date(closing.getTime() - 3 * 24 * 60 * 60 * 1000);
    const dateStr = reminderDate.toISOString().split('T')[0];
    await createAndSave(
      'submission_reminder',
      `Submit Tender - ${tender.title}`,
      `Due in 3 days`,
      '',
      { date: dateStr },
      { date: dateStr }
    );
  }
}

module.exports = {
  getAuthUrl,
  handleCallback,
  createEvent,
  updateEvent,
  deleteEvent,
  syncTenderEvents,
};