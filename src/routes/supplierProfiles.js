const express = require('express');
const router = express.Router();
const db = require('../db'); // your PostgreSQL pool
const { requireAuth } = require('../middleware/auth');

// Helper: ensure user owns profile
async function getProfileAndCheckOwnership(profileId, userId) {
    const result = await db.query(
        'SELECT * FROM supplier_profiles WHERE id = $1',
        [profileId]
    );
    if (result.rows.length === 0) {
        throw new Error('Profile not found');
    }
    const profile = result.rows[0];
    if (profile.user_id !== userId) {
        throw new Error('Forbidden');
    }
    return profile;
}

// GET /api/v1/profiles — list user's profiles
router.get('/', requireAuth, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM supplier_profiles WHERE user_id = $1 ORDER BY is_default DESC, profile_name',
            [req.user.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/profiles/:id — get one profile
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const profile = await getProfileAndCheckOwnership(parseInt(req.params.id), req.user.id);
        res.json({ success: true, data: profile });
    } catch (err) {
        const status = err.message === 'Forbidden' ? 403 : 404;
        res.status(status).json({ success: false, error: err.message });
    }
});

// POST /api/v1/profiles — create new
router.post('/', requireAuth, async (req, res) => {
    const client = await db.connect();
    try {
        const {
            profile_name, legal_name, trading_name, company_registration, vat_number,
            tax_clearance_pin, tax_clearance_expiry, bbbee_level, bbbee_certificate_url,
            bbbee_expiry, bbbee_verification_agency, black_ownership_percent,
            black_women_ownership_percent, csd_number, csd_registered_date, csd_active,
            primary_sectors, secondary_sectors, services_offered, max_contract_value_zar,
            min_contract_value_zar, geographic_coverage, years_in_operation,
            number_of_employees, annual_turnover_zar, documents, past_projects, key_personnel,
            is_default = false
        } = req.body;

        // Check if user already has any profile
        const existingCount = await db.query('SELECT COUNT(*) FROM supplier_profiles WHERE user_id = $1', [req.user.id]);
        const hasProfiles = parseInt(existingCount.rows[0].count) > 0;

        let finalIsDefault = is_default;
        if (!hasProfiles) finalIsDefault = true; // first profile becomes default

        // If requested default true and there is already a default, unset that one
        await client.query('BEGIN');
        if (finalIsDefault) {
            await client.query(
                'UPDATE supplier_profiles SET is_default = false WHERE user_id = $1 AND is_default = true',
                [req.user.id]
            );
        }

        const insertQuery = `
            INSERT INTO supplier_profiles (
                user_id, profile_name, legal_name, trading_name, company_registration,
                vat_number, tax_clearance_pin, tax_clearance_expiry, bbbee_level,
                bbbee_certificate_url, bbbee_expiry, bbbee_verification_agency,
                black_ownership_percent, black_women_ownership_percent, csd_number,
                csd_registered_date, csd_active, primary_sectors, secondary_sectors,
                services_offered, max_contract_value_zar, min_contract_value_zar,
                geographic_coverage, years_in_operation, number_of_employees,
                annual_turnover_zar, documents, past_projects, key_personnel, is_default
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
            RETURNING *
        `;
        const values = [
            req.user.id, profile_name, legal_name, trading_name, company_registration,
            vat_number, tax_clearance_pin, tax_clearance_expiry, bbbee_level,
            bbbee_certificate_url, bbbee_expiry, bbbee_verification_agency,
            black_ownership_percent, black_women_ownership_percent, csd_number,
            csd_registered_date, csd_active, primary_sectors || [], secondary_sectors || [],
            services_offered, max_contract_value_zar, min_contract_value_zar,
            geographic_coverage || [], years_in_operation, number_of_employees,
            annual_turnover_zar, documents || [], past_projects || [], key_personnel || [],
            finalIsDefault
        ];
        const result = await client.query(insertQuery, values);
        await client.query('COMMIT');
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// PUT /api/v1/profiles/:id — update
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const profile = await getProfileAndCheckOwnership(parseInt(req.params.id), req.user.id);
        const allowedFields = [
            'profile_name', 'legal_name', 'trading_name', 'company_registration', 'vat_number',
            'tax_clearance_pin', 'tax_clearance_expiry', 'bbbee_level', 'bbbee_certificate_url',
            'bbbee_expiry', 'bbbee_verification_agency', 'black_ownership_percent',
            'black_women_ownership_percent', 'csd_number', 'csd_registered_date', 'csd_active',
            'primary_sectors', 'secondary_sectors', 'services_offered', 'max_contract_value_zar',
            'min_contract_value_zar', 'geographic_coverage', 'years_in_operation',
            'number_of_employees', 'annual_turnover_zar', 'documents', 'past_projects', 'key_personnel'
        ];
        const updates = [];
        const values = [];
        let idx = 1;
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = $${idx}`);
                values.push(req.body[field]);
                idx++;
            }
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        values.push(parseInt(req.params.id));
        const query = `UPDATE supplier_profiles SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await db.query(query, values);
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/v1/profiles/:id (can't delete default)
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const profile = await getProfileAndCheckOwnership(parseInt(req.params.id), req.user.id);
        if (profile.is_default) {
            return res.status(400).json({ success: false, error: 'Cannot delete default profile' });
        }
        await db.query('DELETE FROM supplier_profiles WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Profile deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/v1/profiles/:id/set-default
router.put('/:id/set-default', requireAuth, async (req, res) => {
    const client = await db.connect();
    try {
        const profile = await getProfileAndCheckOwnership(parseInt(req.params.id), req.user.id);
        await client.query('BEGIN');
        await client.query(
            'UPDATE supplier_profiles SET is_default = false WHERE user_id = $1 AND is_default = true',
            [req.user.id]
        );
        await client.query(
            'UPDATE supplier_profiles SET is_default = true WHERE id = $1',
            [profile.id]
        );
        await client.query('COMMIT');
        res.json({ success: true, message: 'Default profile updated' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// GET /api/v1/profiles/:id/expiry-check
router.get('/:id/expiry-check', requireAuth, async (req, res) => {
    try {
        const profile = await getProfileAndCheckOwnership(parseInt(req.params.id), req.user.id);
        const today = new Date();
        const thirtyDaysLater = new Date();
        thirtyDaysLater.setDate(today.getDate() + 30);

        const expired = [];
        const expiringSoon = [];
        const valid = [];

        const checkDate = (label, dateValue) => {
            if (!dateValue) return;
            const expiry = new Date(dateValue);
            if (expiry < today) expired.push(label);
            else if (expiry <= thirtyDaysLater) expiringSoon.push(label);
            else valid.push(label);
        };

        checkDate('Tax Clearance Certificate', profile.tax_clearance_expiry);
        checkDate('B-BBEE Certificate', profile.bbbee_expiry);

        // Check documents array
        if (profile.documents && Array.isArray(profile.documents)) {
            profile.documents.forEach(doc => {
                if (doc.expiry_date) {
                    const label = `${doc.type} (${doc.name})`;
                    checkDate(label, doc.expiry_date);
                }
            });
        }

        res.json({
            success: true,
            data: {
                expired,
                expiring_within_30_days: expiringSoon,
                valid
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/profiles/:id/duplicate
router.post('/:id/duplicate', requireAuth, async (req, res) => {
    try {
        const original = await getProfileAndCheckOwnership(parseInt(req.params.id), req.user.id);
        const { id, created_at, updated_at, ...copyData } = original;
        copyData.profile_name = `${copyData.profile_name} (Copy)`;
        copyData.is_default = false; // duplicate never default automatically

        const columns = Object.keys(copyData);
        const values = columns.map((col, idx) => {
            let val = copyData[col];
            // Postgres arrays must be passed as proper arrays, but JSONB fields are fine
            if (Array.isArray(val) && (col === 'primary_sectors' || col === 'secondary_sectors' || col === 'geographic_coverage')) {
                // already an array - keep
            }
            return val;
        });
        const placeholders = values.map((_, i) => `$${i+1}`).join(', ');
        const insertQuery = `INSERT INTO supplier_profiles (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
        const result = await db.query(insertQuery, values);
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;