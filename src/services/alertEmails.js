// src/services/alertEmails.js
import { Resend } from 'resend';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Tenderpreneurs Alerts <alerts@tenderpreneurs.co.za>';
const BASE_URL = 'https://tenderpreneurs.co.za';
const BRAND_COLOR = '#1a5c38';
const DARK_RED = '#b00020';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const formatCurrency = (value) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const daysUntil = (dateStr) => {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
};

// Tiny inline style helpers because we write everything inline
const buttonStyle = (bgColor = BRAND_COLOR) =>
  `display:inline-block;padding:10px 20px;background-color:${bgColor};color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;margin:5px;`;

const compactCardStyle =
  'border-bottom:1px solid #e0e0e0;padding:12px 0;';

// -----------------------------------------------------------------------------
// Template: Instant Alert
// -----------------------------------------------------------------------------
const getInstantAlertHtml = (user, tender, alertName) => {
  const closingDate = tender.closingDate || tender.closing;
  const daysLeft = daysUntil(closingDate);
  const closingSoon = daysLeft >= 0 && daysLeft <= 7;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background-color:${BRAND_COLOR};padding:24px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:24px;">Tender Alert — ${alertName}</h1>
    </div>

    <!-- Body -->
    <div style="padding:24px;">
      <div style="border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin-bottom:24px;">
        <!-- Title -->
        <h2 style="margin:0 0 12px 0;font-size:22px;color:#333;">${tender.title}</h2>
        
        <!-- Meta -->
        <p style="margin:4px 0;font-size:16px;"><strong>Entity:</strong> ${tender.entity || tender.department || '—'}</p>
        <p style="margin:4px 0;font-size:16px;">${tender.province || '—'} | ${tender.sector || '—'}</p>
        <p style="margin:4px 0;font-size:16px;"><strong>Value:</strong> ${formatCurrency(tender.value || 0)}</p>
        <p style="margin:4px 0;font-size:16px;">
          <strong>Closing:</strong> ${formatDate(closingDate)}
          ${closingSoon ? `<span style="display:inline-block;margin-left:10px;padding:2px 8px;background-color:${DARK_RED};color:#fff;border-radius:4px;font-size:12px;font-weight:bold;">CLOSING SOON</span>` : ''}
        </p>
      </div>

      <!-- Buttons -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">
        <tr>
          <td align="center" width="50%" style="padding:0 5px;">
            <a href="${BASE_URL}/tenders/${tender.id}" style="${buttonStyle(BRAND_COLOR)}">View Full Tender</a>
          </td>
          <td align="center" width="50%" style="padding:0 5px;">
            <a href="${BASE_URL}/dashboard" style="${buttonStyle(BRAND_COLOR)}">Check Compliance</a>
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="background-color:#fafafa;padding:16px 24px;text-align:center;font-size:13px;color:#666;">
      <a href="${BASE_URL}/alerts/manage" style="color:${BRAND_COLOR};text-decoration:none;">Manage your alerts</a>
      &nbsp;|&nbsp;
      <a href="${BASE_URL}/alerts/unsubscribe" style="color:${BRAND_COLOR};text-decoration:none;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
};

// -----------------------------------------------------------------------------
// Template: Daily Digest
// -----------------------------------------------------------------------------
const getDailyDigestHtml = (user, tenders, alertNames) => {
  // Build a mapping of alertName -> tenders that matched it.
  // A tender may appear under multiple alerts if it matched multiple.
  const tendersByAlert = {};
  
  // First, if tenders have matchedAlertNames we use that, otherwise treat all tenders as a single group.
  const hasMatchInfo = tenders.some(tender => Array.isArray(tender.matchedAlertNames));
  
  if (hasMatchInfo) {
    // Group by each alert name
    alertNames.forEach(name => {
      tendersByAlert[name] = tenders.filter(tender =>
        Array.isArray(tender.matchedAlertNames) && tender.matchedAlertNames.includes(name)
      );
    });
    // Remove alerts that have no matches
    Object.keys(tendersByAlert).forEach(name => {
      if (tendersByAlert[name].length === 0) delete tendersByAlert[name];
    });
  } else {
    // Fallback: single group
    tendersByAlert['Today’s Tender Matches'] = tenders;
  }

  const renderCompactCard = (tender) => {
    const closing = tender.closingDate || tender.closing;
    return `
      <div style="${compactCardStyle}">
        <a href="${BASE_URL}/tenders/${tender.id}" style="text-decoration:none;font-size:16px;font-weight:600;color:${BRAND_COLOR};">
          ${tender.title}
        </a>
        <p style="margin:6px 0 2px;font-size:14px;color:#555;">
          <strong>${tender.entity || tender.department || ''}</strong> · ${formatCurrency(tender.value || 0)} · Closes ${formatDate(closing)}
        </p>
      </div>
    `;
  };

  const sections = Object.entries(tendersByAlert).map(([alertName, list]) => {
    return `
      <div style="margin-bottom:24px;">
        <h3 style="margin:0 0 8px 0;color:${BRAND_COLOR};font-size:18px;">📌 ${alertName}</h3>
        ${list.map(renderCompactCard).join('')}
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background-color:${BRAND_COLOR};padding:24px;">
      <h2 style="color:#ffffff;margin:0;font-size:20px;">Daily Tender Digest</h2>
    </div>

    <!-- Body -->
    <div style="padding:24px;">
      <p style="font-size:16px;margin:0 0 20px;">Good morning ${user.firstName || 'there'}, here are today’s matches.</p>
      ${sections}

      <!-- CTA -->
      <div style="text-align:center;margin-top:24px;">
        <a href="${BASE_URL}/dashboard" style="${buttonStyle(BRAND_COLOR)}">View all tenders on your dashboard</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color:#fafafa;padding:16px 24px;text-align:center;font-size:13px;color:#666;">
      <a href="${BASE_URL}/alerts/manage" style="color:${BRAND_COLOR};text-decoration:none;">Manage your alerts</a>
      &nbsp;|&nbsp;
      <a href="${BASE_URL}/alerts/unsubscribe" style="color:${BRAND_COLOR};text-decoration:none;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
};

// -----------------------------------------------------------------------------
// Template: Weekly Digest
// -----------------------------------------------------------------------------
const getWeeklyDigestHtml = (user, tenders, stats) => {
  // Stats bar data
  const statItems = [
    { label: 'Total New Tenders', value: stats.total_new_tenders || 0 },
    { label: 'Alerts Matched', value: stats.alerts_matched || tenders.length },
    { label: 'Expiring Soon', value: stats.expiring_soon || 0 },
  ];

  const statsBar = `
    <table role="presentation" cellpadding="0" cellspacing="12" border="0" style="width:100%;margin-bottom:24px;">
      <tr>
        ${statItems.map(item => `
          <td align="center" style="background-color:#eef5f1;border-radius:8px;padding:16px 8px;width:33%;">
            <div style="font-size:28px;font-weight:700;color:${BRAND_COLOR};">${item.value}</div>
            <div style="font-size:14px;color:#555;">${item.label}</div>
          </td>
        `).join('')}
      </tr>
    </table>
  `;

  // Tender list with sector badges
  const renderTenderWithSector = (tender) => {
    const closing = tender.closingDate || tender.closing;
    const sector = tender.sector || 'General';
    return `
      <div style="${compactCardStyle}">
        <a href="${BASE_URL}/tenders/${tender.id}" style="text-decoration:none;font-size:16px;font-weight:600;color:${BRAND_COLOR};">
          ${tender.title}
        </a>
        <span style="display:inline-block;margin-left:8px;padding:2px 8px;background-color:#e0e0e0;border-radius:12px;font-size:12px;color:#333;">${sector}</span>
        <p style="margin:6px 0 2px;font-size:14px;color:#555;">
          <strong>${tender.entity || tender.department || ''}</strong> · ${formatCurrency(tender.value || 0)} · Closes ${formatDate(closing)}
        </p>
      </div>
    `;
  };

  // Grouping as in daily digest (but we don't need alert groups to be shown? The prompt says "tender list same as daily but with sector badges"
  // So we'll replicate the same grouping logic with sector badges.
  const tendersByAlert = {};
  const alertNames = user.alertNames || [];  // We'll accept user.alertNames as fallback
  const hasMatchInfo = tenders.some(tender => Array.isArray(tender.matchedAlertNames));
  
  if (hasMatchInfo && alertNames.length) {
    alertNames.forEach(name => {
      tendersByAlert[name] = tenders.filter(tender =>
        Array.isArray(tender.matchedAlertNames) && tender.matchedAlertNames.includes(name)
      );
    });
    Object.keys(tendersByAlert).forEach(name => {
      if (tendersByAlert[name].length === 0) delete tendersByAlert[name];
    });
  } else {
    tendersByAlert['This Week’s Matches'] = tenders;
  }

  const tenderSections = Object.entries(tendersByAlert).map(([alertName, list]) => {
    return `
      <div style="margin-bottom:24px;">
        <h3 style="margin:0 0 8px 0;color:${BRAND_COLOR};font-size:18px;">📌 ${alertName}</h3>
        ${list.map(renderTenderWithSector).join('')}
      </div>
    `;
  }).join('');

  // Expiring this week highlight: tenders closing within 7 days (from now)
  const now = new Date();
  const expiringTenders = tenders.filter(tender => {
    const closing = tenders.closingDate || tender.closing;
    const days = daysUntil(closing);
    return days >= 0 && days <= 7;
  });

  let expiringSection = '';
  if (expiringTenders.length > 0) {
    expiringSection = `
      <div style="margin-top:32px;padding:20px;border-left:4px solid ${DARK_RED};background-color:#fff5f5;border-radius:4px;">
        <h3 style="margin:0 0 12px;color:${DARK_RED};">⏳ Expiring This Week</h3>
        ${expiringTenders.map(tender => {
          const closing = tender.closingDate || tender.closing;
          return `
            <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f8d7da;">
              <a href="${BASE_URL}/tenders/${tender.id}" style="text-decoration:none;font-weight:600;color:${DARK_RED};font-size:16px;">
                ${tender.title}
              </a>
              <p style="margin:4px 0 0;font-size:14px;color:#555;">
                ${tender.entity || tender.department || ''} · Closes ${formatDate(closing)}
              </p>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Upgrade CTA for free users
  let upgradeCta = '';
  if (user.plan === 'free') {
    upgradeCta = `
      <div style="margin-top:32px;padding:20px;background-color:#f0f7f2;border-radius:8px;text-align:center;border:1px solid #c3e0cb;">
        <p style="font-size:16px;color:#333;margin:0 0 12px;">You’re on the <strong>Free Plan</strong> — unlock advanced filters, unlimited alerts and more.</p>
        <a href="${BASE_URL}/pricing" style="${buttonStyle(BRAND_COLOR)}">Upgrade to Pro</a>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background-color:${BRAND_COLOR};padding:24px;">
      <h2 style="color:#ffffff;margin:0;font-size:20px;">Weekly Tender Report</h2>
    </div>

    <!-- Body -->
    <div style="padding:24px;">
      ${statsBar}
      <p style="font-size:16px;">Hi ${user.firstName || 'there'}, here’s your weekly roundup.</p>
      ${tenderSections}
      ${expiringSection}
      ${upgradeCta}

      <div style="text-align:center;margin-top:32px;">
        <a href="${BASE_URL}/dashboard" style="${buttonStyle(BRAND_COLOR)}">View Full Dashboard</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color:#fafafa;padding:16px 24px;text-align:center;font-size:13px;color:#666;">
      <a href="${BASE_URL}/alerts/manage" style="color:${BRAND_COLOR};text-decoration:none;">Manage your alerts</a>
      &nbsp;|&nbsp;
      <a href="${BASE_URL}/alerts/unsubscribe" style="color:${BRAND_COLOR};text-decoration:none;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
};

// -----------------------------------------------------------------------------
// Exported functions
// -----------------------------------------------------------------------------

/**
 * Send an instant alert for a single tender match.
 * @param {Object} user - { email, firstName }
 * @param {Object} tender - { id, title, entity, province, sector, value, closingDate/closing }
 * @param {string} alertName
 */
export async function sendInstantAlert(user, tender, alertName) {
  const subject = `New tender match: ${tender.title}`;
  const html = getInstantAlertHtml(user, tender, alertName);

  return resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject,
    html,
  });
}

/**
 * Send a daily digest of matched tenders.
 * @param {Object} user - { email, firstName, alertNames? }
 * @param {Array} tenders - Array of tender objects. Each may have matchedAlertNames array.
 * @param {Array<string>} alertNames - All active alert names (used for grouping if match data exists).
 */
export async function sendDailyDigest(user, tenders, alertNames = []) {
  const subject = `${tenders.length} new tenders matching your alerts`;
  const html = getDailyDigestHtml(user, tenders, alertNames);

  return resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject,
    html,
  });
}

/**
 * Send a weekly digest with stats and expiring tenders.
 * @param {Object} user - { email, firstName, plan, alertNames? }
 * @param {Array} tenders - Array of tender objects (may have matchedAlertNames).
 * @param {Object} stats - { total_new_tenders, alerts_matched, expiring_soon }
 */
export async function sendWeeklyDigest(user, tenders, stats) {
  const matchesCount = stats.alerts_matched || tenders.length;
  const subject = `Your weekly tender report — ${matchesCount} new matches`;
  const html = getWeeklyDigestHtml(user, tenders, stats);

  return resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject,
    html,
  });
}