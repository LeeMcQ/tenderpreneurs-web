const cron = require('node-cron');
const db = require('../db');
const { sendEmail, sendWhatsApp } = require('../services/notifications'); // hypothetical services

// Run daily at 8:00 AM South Africa Standard Time (UTC+2)
cron.schedule('0 8 * * *', async () => {
    console.log('[ExpiryChecker] Running expiry check...');
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    try {
        // Find all profiles where any expiry date is within next 7 days
        const query = `
            SELECT sp.*, u.email, u.phone, u.whatsapp_enabled, u.email_notifications
            FROM supplier_profiles sp
            JOIN users u ON u.id = sp.user_id
            WHERE (
                (sp.tax_clearance_expiry BETWEEN NOW() AND $1) OR
                (sp.bbbee_expiry BETWEEN NOW() AND $1) OR
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements(sp.documents) AS doc
                    WHERE (doc->>'expiry_date')::date BETWEEN NOW() AND $1
                )
            )
        `;
        const result = await db.query(query, [sevenDaysFromNow]);
        const profiles = result.rows;

        // Group by user to send one consolidated notification per user
        const usersMap = new Map();
        for (const profile of profiles) {
            if (!usersMap.has(profile.user_id)) {
                usersMap.set(profile.user_id, {
                    email: profile.email,
                    phone: profile.phone,
                    whatsapp_enabled: profile.whatsapp_enabled,
                    email_notifications: profile.email_notifications,
                    expiringItems: []
                });
            }
            const userData = usersMap.get(profile.user_id);

            // Collect specific expiring items
            if (profile.tax_clearance_expiry && new Date(profile.tax_clearance_expiry) <= sevenDaysFromNow) {
                userData.expiringItems.push(`Tax Clearance Certificate (expires ${new Date(profile.tax_clearance_expiry).toLocaleDateString()}) for profile "${profile.profile_name}"`);
            }
            if (profile.bbbee_expiry && new Date(profile.bbbee_expiry) <= sevenDaysFromNow) {
                userData.expiringItems.push(`B-BBEE Certificate (expires ${new Date(profile.bbbee_expiry).toLocaleDateString()}) for profile "${profile.profile_name}"`);
            }
            if (profile.documents && Array.isArray(profile.documents)) {
                profile.documents.forEach(doc => {
                    if (doc.expiry_date && new Date(doc.expiry_date) <= sevenDaysFromNow) {
                        userData.expiringItems.push(`${doc.type} document "${doc.name}" (expires ${new Date(doc.expiry_date).toLocaleDateString()}) for profile "${profile.profile_name}"`);
                    }
                });
            }
        }

        // Send notifications
        for (const [userId, user] of usersMap.entries()) {
            if (user.expiringItems.length === 0) continue;
            const itemsList = user.expiringItems.join('\n- ');
            const subject = 'Your compliance documents expire within 7 days';
            const emailBody = `Dear supplier,\n\nThe following documents are expiring soon:\n- ${itemsList}\n\nPlease renew them to stay compliant on Tenderpreneurs.\n\nRegards,\nTenderpreneurs Team`;

            if (user.email_notifications && user.email) {
                await sendEmail(user.email, subject, emailBody).catch(e => console.error(`Email failed for ${user.email}:`, e));
            }
            if (user.whatsapp_enabled && user.phone) {
                const whatsappMsg = `⚠️ *Compliance Alert*: Your documents expire in 7 days:\n${user.expiringItems.map(i => `• ${i}`).join('\n')}`;
                await sendWhatsApp(user.phone, whatsappMsg).catch(e => console.error(`WhatsApp failed for ${user.phone}:`, e));
            }
        }

        console.log(`[ExpiryChecker] Processed ${profiles.length} profiles with upcoming expiries.`);
    } catch (err) {
        console.error('[ExpiryChecker] Error:', err);
    }
}, {
    timezone: "Africa/Johannesburg"
});