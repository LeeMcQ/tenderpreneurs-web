// src/jobs/alertMatcher.js
import { pool } from '../db';
import { Resend } from 'resend';
import cron from 'node-cron';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'alerts@tenderpreneurs.co.za';
const BASE_URL = process.env.BASE_URL || 'https://tenderpreneurs.co.za';

// --- Helper functions ---

async function insertAlertLogs(rows, frequency) {
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO alert_log (user_id, preference_id, tender_id, frequency, sent_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [row.user_id, row.preference_id, row.tender_id, frequency]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function buildInstantEmail(tender, userEmail) {
  const tenderLink = `${BASE_URL}/tenders/${tender.tender_id}`;
  return {
    from: FROM_EMAIL,
    to: userEmail,
    subject: `New Tender: ${tender.title}`,
    html: `
      <h2>${tender.title}</h2>
      <p><strong>Province:</strong> ${tender.province || 'N/A'}</p>
      <p><strong>Sector:</strong> ${tender.sector || 'N/A'}</p>
      <p><strong>Estimated Value:</strong> R ${tender.value ? tender.value.toLocaleString() : 'N/A'}</p>
      <a href="${tenderLink}">View Tender</a>
    `
  };
}

function buildDigestEmail(userEmail, tenders, frequency) {
  const tenderList = tenders.map(t => `
    <li style="margin-bottom:1rem;">
      <a href="${BASE_URL}/tenders/${t.id}" style="font-weight:bold;">${t.title}</a>
      <div>Province: ${t.province || 'N/A'} | Sector: ${t.sector || 'N/A'} | Value: R ${t.value ? t.value.toLocaleString() : 'N/A'}</div>
    </li>
  `).join('');

  return {
    from: FROM_EMAIL,
    to: userEmail,
    subject: `Your ${frequency} Tender Digest`,
    html: `
      <h2>${frequency === 'daily' ? 'Daily' : 'Weekly'} Tender Digest</h2>
      <ul>${tenderList}</ul>
      <p><a href="${BASE_URL}/dashboard">View all tenders</a></p>
    `
  };
}

async function sendEmailBatch(emails) {
  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    try {
      await resend.emails.send(batch);
    } catch (error) {
      console.error(`Failed to send email batch (${i}):`, error);
      // Continue with next batch; marks these as not sent (no log inserted)
    }
  }
}

// --- Alert runners ---

export async function runInstantAlerts() {
  const client = await pool.connect();
  try {
    const { rows: matches } = await client.query(`
      WITH recent_tenders AS (
        SELECT * FROM tenders
        WHERE created_at >= NOW() - INTERVAL '10 minutes'
      )
      SELECT 
        ap.id AS preference_id,
        ap.user_id,
        u.email,
        t.id AS tender_id,
        t.title,
        t.province,
        t.sector,
        t.value
      FROM recent_tenders t
      JOIN alert_preferences ap 
        ON ap.is_active = true 
        AND ap.frequency = 'instant'
        AND (ap.provinces IS NULL OR array_length(ap.provinces, 1) IS NULL OR t.province = ANY(ap.provinces))
        AND (ap.sectors IS NULL OR array_length(ap.sectors, 1) IS NULL OR t.sector = ANY(ap.sectors))
        AND (ap.keywords IS NULL OR array_length(ap.keywords, 1) IS NULL 
              OR EXISTS (
                SELECT 1 FROM unnest(ap.keywords) k 
                WHERE t.title ILIKE '%' || k || '%'
              ))
        AND (ap.min_value_zar IS NULL OR t.value >= ap.min_value_zar)
      JOIN users u ON u.id = ap.user_id
      WHERE NOT EXISTS (
        SELECT 1 FROM alert_log al
        WHERE al.preference_id = ap.id AND al.tender_id = t.id
      )
      ORDER BY t.created_at DESC
    `);

    if (matches.length === 0) return;

    // Build emails
    const emails = matches.map(m => buildInstantEmail(m, m.email));

    // Send in batches of 50
    await sendEmailBatch(emails);

    // Log sent alerts
    await insertAlertLogs(matches, 'instant');
    console.log(`Sent ${matches.length} instant alerts`);
  } catch (error) {
    console.error('Error in runInstantAlerts:', error);
  } finally {
    client.release();
  }
}

async function runDigest(frequency, interval, maxTenders) {
  const client = await pool.connect();
  try {
    // Get distinct users with active preferences of this frequency
    const { rows: users } = await client.query(
      `SELECT DISTINCT user_id 
       FROM alert_preferences 
       WHERE is_active = true AND frequency = $1`,
      [frequency]
    );

    for (const { user_id } of users) {
      // Get user's active preferences of this frequency
      const { rows: prefs } = await client.query(
        `SELECT id FROM alert_preferences 
         WHERE user_id = $1 AND is_active = true AND frequency = $2`,
        [user_id, frequency]
      );
      if (prefs.length === 0) continue;

      // Build OR EXISTS clauses for each preference
      const existsClauses = prefs.map((_, idx) => {
        const paramIdx = 3 + idx; // $3, $4, ...
        return `
          EXISTS (
            SELECT 1 FROM alert_preferences ap
            WHERE ap.id = $${paramIdx}
              AND ap.user_id = $1
              AND ap.is_active = true
              AND ap.frequency = $2
              AND (ap.provinces IS NULL OR array_length(ap.provinces, 1) IS NULL OR t.province = ANY(ap.provinces))
              AND (ap.sectors IS NULL OR array_length(ap.sectors, 1) IS NULL OR t.sector = ANY(ap.sectors))
              AND (ap.keywords IS NULL OR array_length(ap.keywords, 1) IS NULL 
                    OR EXISTS (
                      SELECT 1 FROM unnest(ap.keywords) k 
                      WHERE t.title ILIKE '%' || k || '%'
                    ))
              AND (ap.min_value_zar IS NULL OR t.value >= ap.min_value_zar)
          )`;
      }).join(' OR ');

      const params = [user_id, frequency, ...prefs.map(p => p.id)];
      const query = `
        SELECT DISTINCT t.id, t.title, t.province, t.sector, t.value, t.created_at
        FROM tenders t
        WHERE t.created_at >= NOW() - INTERVAL '${interval}'
          AND (${existsClauses})
          AND NOT EXISTS (
            SELECT 1 FROM alert_log al
            WHERE al.user_id = $1 AND al.tender_id = t.id AND al.frequency = $2
          )
        ORDER BY t.created_at DESC
        LIMIT $${params.length + 1}
      `;
      params.push(maxTenders);

      const { rows: tenders } = await client.query(query, params);
      if (tenders.length === 0) continue;

      // Fetch user email
      const { rows: [user] } = await client.query(
        `SELECT email FROM users WHERE id = $1`,
        [user_id]
      );
      const email = buildDigestEmail(user.email, tenders, frequency);
      try {
        await resend.emails.send(email);
      } catch (err) {
        console.error(`Failed to send ${frequency} digest to user ${user_id}:`, err);
        continue; // skip log insert if email fails
      }

      // Log as sent
      const logRows = tenders.map(t => ({
        user_id,
        preference_id: null,
        tender_id: t.id,
      }));
      await insertAlertLogs(logRows, frequency);

      console.log(`Sent ${frequency} digest with ${tenders.length} tenders to user ${user_id}`);
    }
  } catch (error) {
    console.error(`Error in runDigest (${frequency}):`, error);
  } finally {
    client.release();
  }
}

export const runDailyAlerts = () => runDigest('daily', '1 day', 10);
export const runWeeklyAlerts = () => runDigest('weekly', '7 days', 20);

// --- Cron scheduling ---

export function initAlertJobs() {
  // Daily at 7:00 SAST (UTC+2)
  cron.schedule('0 7 * * *', runDailyAlerts, {
    timezone: 'Africa/Johannesburg',
  });
  // Weekly on Monday at 7:00 SAST
  cron.schedule('0 7 * * 1', runWeeklyAlerts, {
    timezone: 'Africa/Johannesburg',
  });
  console.log('Alert cron jobs scheduled');
}