// src/routes/drafter.js
// =============================================================================
// Migration (inline SQL) for drafts table:
// To be run manually or via migration tool against the PostgreSQL database.
// -----------------------------------------------------------------------------
// CREATE TABLE IF NOT EXISTS drafts (
//   id            SERIAL PRIMARY KEY,
//   user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//   tender_id     INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
//   company_data  JSONB NOT NULL DEFAULT '{}',
//   content       TEXT,
//   word_count    INTEGER DEFAULT 0,
//   version       INTEGER DEFAULT 1,
//   status        VARCHAR(50) DEFAULT 'draft',
//   created_at    TIMESTAMPTZ DEFAULT NOW(),
//   updated_at    TIMESTAMPTZ DEFAULT NOW()
// );
// CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);
// CREATE INDEX IF NOT EXISTS idx_drafts_tender_id ON drafts(tender_id);
// =============================================================================

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db');                // PostgreSQL pool
const auth = require('../middleware/auth');   // authentication middleware
const { aiGate } = require('../middleware/planGate'); // planGate middleware

const router = express.Router();

// Instantiate Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-20250514';

// ----------------------------------------------------------------------------
// Helper: simple word count
// ----------------------------------------------------------------------------
const wordCount = (text) =>
  (text && typeof text === 'string')
    ? text.trim().split(/\s+/).filter(Boolean).length
    : 0;

// ----------------------------------------------------------------------------
// Helper: deduct one usage from ai_usage_log
// (aiGate middleware already checks & blocks if quota exceeded)
// ----------------------------------------------------------------------------
async function deductUsage(userId, feature) {
  try {
    await pool.query(
      `INSERT INTO ai_usage_log (user_id, feature, used_at)
        VALUES ($1, $2, NOW())`,
      [userId, feature]
    );
  } catch (err) {
    console.error('Failed to record AI usage:', err.message);
  }
}

// ----------------------------------------------------------------------------
// POST /api/v1/drafter/generate
// ----------------------------------------------------------------------------
router.post('/generate', auth, aiGate('drafter'), async (req, res) => {
  const {
    tender_id,
    company_name,
    company_registration,
    bbbee_level,
    years_experience,
    relevant_projects = [],
    team_members = [],
    approach_notes = '',
  } = req.body;

  // Basic validation
  if (!tender_id || !company_name) {
    return res.status(400).json({
      error: 'Missing required fields: tender_id and company_name are required.',
    });
  }

  try {
    // Fetch tender details
    const { rows: [tender] } = await pool.query(
      'SELECT * FROM tenders WHERE id = $1',
      [tender_id]
    );
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found.' });
    }

    // Build the user prompt
    const projectsText = relevant_projects
      .map(
        (p, i) =>
          `${i + 1}. ${p.name} – Client: ${p.client}, ` +
          `Value: ${p.value}, Year: ${p.year}`
      )
      .join('\n');

    const teamText = team_members
      .map((m) => ` - ${m.name}, ${m.role} (${m.qualification})`)
      .join('\n');

    const tenderInfo = `
Tender Title: ${tender.title || 'N/A'}
Tender Number: ${tender.tender_number || 'N/A'}
Department/Entity: ${tender.department || 'N/A'}
Description: ${tender.description || ''}
Evaluation Criteria: ${tender.evaluation_criteria || 'Not specified'}
`.trim();

    const userPrompt = `
Write a complete South African government tender bid response based on the details below.

TENDER INFORMATION:
${tenderInfo}

COMPANY PROFILE:
- Company Name: ${company_name}
- Registration Number: ${company_registration || 'N/A'}
- B-BBEE Level: ${bbbee_level || 'Not provided'}
- Years of Experience: ${years_experience || 'Not provided'}
- Relevant Projects:
${projectsText || 'None provided'}

- Team Members:
${teamText || 'None provided'}

- Approach / Notes from the bidder:
${approach_notes || 'No additional notes'}

Create a comprehensive bid document that covers:
1. Executive Summary
2. Company Profile and Relevant Experience
3. Methodology and Approach
4. Project Plan and Timeline
5. Team and Qualifications
6. B-BBEE Compliance and Local Content
7. Financial Proposal (if relevant – indicate where figures would be inserted)
8. References and Past Projects

Structure the response to maximise functionality points for the evaluation criteria provided. Deeply integrate PFMA, PPPFA, and B-BBEE requirements. Use clear headings, bullet points where appropriate, and professional language. The final output must be a ready-to-submit tender response.
`.trim();

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    let fullContent = '';

    // Stream from Claude
    const stream = anthropic.messages.stream({
      model: MODEL,
      system:
        'You are an expert South African government tender bid writer with 20 years experience. ' +
        'You write compelling, compliant, winning bids. You know PFMA, PPPFA, B-BBEE requirements deeply. ' +
        'Always structure bids to score maximum functionality points.',
      messages: [
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    });

    // Event listeners
    stream.on('text', (textDelta) => {
      fullContent += textDelta;
      res.write(`data: ${JSON.stringify({ token: textDelta })}\n\n`);
    });

    stream.on('end', async () => {
      // Send completion event
      res.write('event: done\ndata: [DONE]\n\n');

      // Save draft to DB
      const wCount = wordCount(fullContent);
      try {
        await pool.query(
          `INSERT INTO drafts
             (user_id, tender_id, company_data, content, word_count, version, status)
           VALUES ($1, $2, $3, $4, $5, 1, 'completed')`,
          [
            req.user.id,
            tender_id,
            JSON.stringify({
              company_name,
              company_registration,
              bbbee_level,
              years_experience,
              relevant_projects,
              team_members,
              approach_notes,
            }),
            fullContent,
            wCount,
          ]
        );
      } catch (dbErr) {
        console.error('Failed to save draft:', dbErr.message);
      }

      // Deduct AI usage
      await deductUsage(req.user.id, 'drafter');

      res.end();
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      // If headers already sent, we can only close the connection
      if (res.headersSent) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: 'Stream error occurred.' })}\n\n`
        );
        res.end();
      } else {
        res.status(500).json({ error: 'An error occurred during generation.' });
      }
    });
  } catch (error) {
    console.error('Generation error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
});

// ----------------------------------------------------------------------------
// POST /api/v1/drafter/improve
// ----------------------------------------------------------------------------
router.post('/improve', auth, async (req, res) => {
  const { draft_id, section, instruction } = req.body;

  if (!draft_id || !section || !instruction) {
    return res.status(400).json({
      error: 'draft_id, section, and instruction are required.',
    });
  }

  try {
    const { rows: [draft] } = await pool.query(
      'SELECT * FROM drafts WHERE id = $1 AND user_id = $2',
      [draft_id, req.user.id]
    );
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found.' });
    }

    const fullContent = draft.content;

    // Prompt Claude to improve only the specified section
    const improvePrompt = `
You are a South African tender expert. Below is a complete tender draft.

--- DRAFT START ---
${fullContent}
--- DRAFT END ---

The user wants you to improve the section titled "${section}" according to this instruction:
"${instruction}"

Return **only** the improved text for that section. Do **not** include the section heading or any other commentary. Output just the body content that would appear under that section heading.
`.trim();

    const response = await anthropic.messages.create({
      model: MODEL,
      system:
        'You are an expert South African government tender bid writer. ' +
        'You must return exactly the improved section content, no extra text.',
      messages: [{ role: 'user', content: improvePrompt }],
      max_tokens: 2048,
      temperature: 0.2,
    });

    // Anthropic response structure: content[0].text (if text block)
    const improvedSection = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!improvedSection) {
      return res.status(500).json({ error: 'Failed to generate improvement.' });
    }

    // Replace the section in the full draft
    // We locate the heading line that contains the section name (case-insensitive)
    // and replace from after that heading until the next heading (or end).
    const headingRegex = new RegExp(
      `(^|\n)(#+\s*|\\d+\\.?\\s*)(.*?${escapeRegex(section)}.*?)(\n|$)`,
      'i'
    );
    const match = fullContent.match(headingRegex);

    if (!match) {
      return res.status(400).json({
        error: `Could not find a section matching "${section}" in the draft.`,
      });
    }

    const headingStart = match.index + match[0].length; // point after the heading line
    // Find the start of the next section or end of string
    const nextHeadingRegex = /(\n#+\s|\n\d+\.\s)/g;
    nextHeadingRegex.lastIndex = headingStart;
    const nextMatch = nextHeadingRegex.exec(fullContent);
    const sectionEnd = nextMatch ? nextMatch.index : fullContent.length;

    // Build new content: everything before headingStart + new improved text + after sectionEnd
    const beforeHeading = fullContent.substring(0, headingStart);
    const afterSection = fullContent.substring(sectionEnd);
    const newFullContent = beforeHeading + '\n' + improvedSection + afterSection;

    const newWordCount = wordCount(newFullContent);

    // Update draft
    await pool.query(
      `UPDATE drafts
         SET content = $1,
             word_count = $2,
             version = version + 1,
             updated_at = NOW()
       WHERE id = $3`,
      [newFullContent, newWordCount, draft_id]
    );

    // Return the improved section only
    return res.json({ section: improvedSection });
  } catch (error) {
    console.error('Improve error:', error.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Helper to escape special regex characters in section name
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ----------------------------------------------------------------------------
// GET /api/v1/drafter/drafts
// ----------------------------------------------------------------------------
router.get('/drafts', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, t.title AS tender_title, d.created_at, d.word_count,
              d.status
       FROM drafts d
       JOIN tenders t ON d.tender_id = t.id
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('List drafts error:', error.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/v1/drafter/drafts/:id
// ----------------------------------------------------------------------------
router.get('/drafts/:id', auth, async (req, res) => {
  try {
    const { rows: [draft] } = await pool.query(
      'SELECT * FROM drafts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found.' });
    }
    res.json(draft);
  } catch (error) {
    console.error('Get draft error:', error.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;