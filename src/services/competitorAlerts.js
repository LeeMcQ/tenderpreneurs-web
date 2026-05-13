// competitorAlerts.js
// Functions for competitor alert notifications, stats, and intelligence.

const db = require('../db');
const notifications = require('./notifications'); // sendEmail, sendWhatsApp helpers

/**
 * After a new award is saved, check all tracked competitors and send alerts.
 */
async function checkCompetitorAlerts(awardId) {
  // 1. Fetch award details
  const awardResult = await db.query(
    `SELECT id, winner_name, award_value_zar, award_date, tender_id
     FROM tender_awards WHERE id = $1`,
    [awardId]
  );
  if (awardResult.rows.length === 0) return;
  const award = awardResult.rows[0];

  // 2. Find all tracked competitors where winner_name ILIKE competitor_name
  const competitorsResult = await db.query(
    `SELECT tc.id, tc.user_id, tc.competitor_name, tc.alert_on_new_award,
            u.email, u.phone
     FROM tracked_competitors tc
     JOIN users u ON tc.user_id = u.id
     WHERE $1 ILIKE '%' || tc.competitor_name || '%'
       AND tc.alert_on_new_award = true`,
    [award.winner_name]
  );

  // 3. For each match, send alert & log it
  for (const comp of competitorsResult.rows) {
    try {
      // Prevent duplicate alerts (unique constraint on tracked_competitor_id + award_id)
      await db.query(
        `INSERT INTO competitor_alerts_log (tracked_competitor_id, award_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [comp.id, award.id]
      );

      // Send email notification
      await notifications.sendEmail({
        to: comp.email,
        subject: `Competitor Alert: ${comp.competitor_name} won a tender`,
        body: `Your tracked competitor "${comp.competitor_name}" won tender #${award.tender_id} for R${Number(award.award_value_zar).toLocaleString()} on ${award.award_date}.`
      });

      // If phone number exists, send WhatsApp message
      if (comp.phone) {
        await notifications.sendWhatsApp({
          to: comp.phone,
          message: `🚨 *Competitor Alert*\n"${comp.competitor_name}" just won a tender worth R${Number(award.award_value_zar).toLocaleString()} (${award.award_date}). View details on Tenderpreneurs.`
        });
      }

      console.log(`Alert sent to user ${comp.user_id} for award ${award.id}`);
    } catch (err) {
      console.error(`Failed to send alert for competitor ${comp.id}:`, err);
    }
  }
}

/**
 * Get comprehensive statistics for a specific competitor (optionally scoped to a user).
 */
async function getCompetitorStats(competitorName, userId = null) {
  // Base query filters by competitor name (case-insensitive)
  const baseWhere = `WHERE winner_name ILIKE $1`;
  const params = [`%${competitorName}%`];

  // Date 12 months ago
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  // Total awards in last 12 months
  const totalAwardsRes = await db.query(
    `SELECT COUNT(*)::int AS total_awards,
            COALESCE(SUM(award_value_zar), 0) AS total_value_zar
     FROM tender_awards
     ${baseWhere} AND award_date >= $2`,
    [...params, twelveMonthsAgo]
  );

  // Sectors won in (requires joining tenders table for sector)
  const sectorsRes = await db.query(
    `SELECT DISTINCT t.sector
     FROM tender_awards ta
     JOIN tenders t ON ta.tender_id = t.id
     ${baseWhere} AND ta.award_date >= $2`,
    [...params, twelveMonthsAgo]
  );

  // Procuring entities won from
  const entitiesRes = await db.query(
    `SELECT DISTINCT t.procuring_entity
     FROM tender_awards ta
     JOIN tenders t ON ta.tender_id = t.id
     ${baseWhere} AND ta.award_date >= $2`,
    [...params, twelveMonthsAgo]
  );

  // Average award value
  const avgRes = await db.query(
    `SELECT ROUND(AVG(award_value_zar))::bigint AS avg_value
     FROM tender_awards
     ${baseWhere} AND award_date >= $2`,
    [...params, twelveMonthsAgo]
  );

  // Biggest win
  const biggestWinRes = await db.query(
    `SELECT ta.tender_id, ta.award_value_zar, ta.award_date,
            t.title AS tender_title
     FROM tender_awards ta
     JOIN tenders t ON ta.tender_id = t.id
     ${baseWhere} AND ta.award_date >= $2
     ORDER BY ta.award_value_zar DESC
     LIMIT 1`,
    [...params, twelveMonthsAgo]
  );

  const totalAwards = totalAwardsRes.rows[0]?.total_awards || 0;
  const months = 12;
  const winFrequency = totalAwards > 0
    ? `${(totalAwards / months).toFixed(1)} tenders/month`
    : '0 tenders/month';

  return {
    total_awards_last_12_months: totalAwards,
    total_value_won_zar: Number(totalAwardsRes.rows[0]?.total_value_zar || 0),
    sectors_won_in: sectorsRes.rows.map(r => r.sector),
    entities_won_from: entitiesRes.rows.map(r => r.procuring_entity),
    average_award_value: Number(avgRes.rows[0]?.avg_value || 0),
    biggest_win: biggestWinRes.rows[0]
      ? {
          tender: biggestWinRes.rows[0].tender_title,
          value: Number(biggestWinRes.rows[0].award_value_zar),
          date: biggestWinRes.rows[0].award_date
        }
      : null,
    win_frequency: winFrequency
  };
}

/**
 * Generate competitive intelligence insights for a competitor.
 */
async function getCompetitorIntelligence(competitorName) {
  // Recent awards (last 10)
  const recentAwardsRes = await db.query(
    `SELECT ta.id, ta.award_value_zar, ta.award_date, t.title AS tender_title, t.sector, t.procuring_entity
     FROM tender_awards ta
     JOIN tenders t ON ta.tender_id = t.id
     WHERE ta.winner_name ILIKE $1
     ORDER BY ta.award_date DESC
     LIMIT 10`,
    [`%${competitorName}%`]
  );

  // Dominant sectors (top 3 by count)
  const sectorsRes = await db.query(
    `SELECT t.sector, COUNT(*) AS count
     FROM tender_awards ta
     JOIN tenders t ON ta.tender_id = t.id
     WHERE ta.winner_name ILIKE $1
     GROUP BY t.sector
     ORDER BY count DESC
     LIMIT 3`,
    [`%${competitorName}%`]
  );

  // Typical price range: calculate median or quartiles? Use average and stddev.
  const priceStatsRes = await db.query(
    `SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY award_value_zar) AS p25,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY award_value_zar) AS p75,
            ROUND(AVG(award_value_zar))::bigint AS avg_value
     FROM tender_awards
     WHERE winner_name ILIKE $1`,
    [`%${competitorName}%`]
  );

  const recentAwards = recentAwardsRes.rows;
  const dominantSectors = sectorsRes.rows.map(r => r.sector);
  const priceStats = priceStatsRes.rows[0] || {};

  // Generate strategic suggestions (rule-based)
  let strategy = '';
  if (dominantSectors.length > 0) {
    strategy = `They dominate in ${dominantSectors.join(', ')}. `;
  }
  if (priceStats.avg_value) {
    strategy += `Their typical win is around R${Number(priceStats.avg_value).toLocaleString()}. `;
  }
  // Add specific analysis based on Gauteng or B-BBEE (simplified)
  strategy += 'Consider competing on B-BBEE level, specialised expertise, or lower overhead.';

  return {
    competitor_name: competitorName,
    recent_awards: recentAwards.map(a => ({
      tender: a.tender_title,
      value: Number(a.award_value_zar),
      date: a.award_date,
      sector: a.sector,
      entity: a.procuring_entity
    })),
    dominant_sectors: dominantSectors,
    typical_price_range: priceStats.p25 && priceStats.p75
      ? `R${Number(priceStats.p25).toLocaleString()} – R${Number(priceStats.p75).toLocaleString()}`
      : 'Unknown',
    average_win_value: Number(priceStats.avg_value || 0),
    suggested_strategies: strategy
  };
}

module.exports = {
  checkCompetitorAlerts,
  getCompetitorStats,
  getCompetitorIntelligence
};