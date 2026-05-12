import { Router } from 'express';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
         TableOfContents, PageBreak, Footer, convertMillimetersToTwip } from 'docx';
import Draft from '../models/Draft.js';            // adjust path as needed
import { authenticate } from '../middleware/auth.js'; // adjust path as needed

const router = Router();

// ------------------------------------------------------------
// Helper: create a body paragraph with professional formatting
// ------------------------------------------------------------
function bodyParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { line: 276 },                       // 1.15 line spacing
    ...options,
    children: [
      new TextRun({
        text,
        font: 'Calibri',
        size: 22,                                 // 11pt in half-points
      }),
    ],
  });
}

// ------------------------------------------------------------
// Helper: build a cover page section
// ------------------------------------------------------------
function coverSection(title, company, date) {
  return {
    properties: {
      page: {
        margin: {
          top: convertMillimetersToTwip(25),
          bottom: convertMillimetersToTwip(25),
          left: convertMillimetersToTwip(25),
          right: convertMillimetersToTwip(25),
        },
      },
    },
    children: [
      new Paragraph({ spacing: { after: 400 } }), // spacer
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: title,
            bold: true,
            font: 'Calibri',
            size: 48,                             // 24pt title
          }),
        ],
      }),
      new Paragraph({ spacing: { after: 200 } }),
      bodyParagraph(company, { alignment: AlignmentType.CENTER }),
      bodyParagraph(date, { alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new PageBreak()] }),
    ],
  };
}

// ------------------------------------------------------------
// Helper: build the Table of Contents section
// ------------------------------------------------------------
function tocSection(footer) {
  return {
    properties: {
      page: {
        margin: {
          top: convertMillimetersToTwip(25),
          bottom: convertMillimetersToTwip(25),
          left: convertMillimetersToTwip(25),
          right: convertMillimetersToTwip(25),
        },
      },
      footer,                                     // reuse the same footer
    },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: 'Table of Contents', font: 'Calibri' })],
      }),
      new TableOfContents('Table of Contents', {
        hyperlink: true,
        headingStyleRange: '1-2',
      }),
      new Paragraph({ children: [new PageBreak()] }),
    ],
  };
}

// ------------------------------------------------------------
// Helper: build content sections from markdown blocks
// ------------------------------------------------------------
function contentSections(markdown, footer) {
  const children = [];
  const sections = markdown.split(/^## /gm).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = lines[0].trim();               // first line is the heading text
    const bodyLines = lines.slice(1).filter(line => line.trim() !== '');

    // Section heading (Heading 2)
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: heading, font: 'Calibri' })],
      })
    );

    // Body paragraphs
    for (const line of bodyLines) {
      children.push(bodyParagraph(line));
    }

    // Small spacing after each section
    children.push(new Paragraph({ spacing: { after: 200 } }));
  }

  return {
    properties: {
      page: {
        margin: {
          top: convertMillimetersToTwip(25),
          bottom: convertMillimetersToTwip(25),
          left: convertMillimetersToTwip(25),
          right: convertMillimetersToTwip(25),
        },
      },
      footer,
    },
    children,
  };
}

// ------------------------------------------------------------
// Helper: create the footer shared by all sections except cover
// ------------------------------------------------------------
function createFooter(company) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Prepared by ${company} | tenderpreneurs.co.za`,
            font: 'Calibri',
            size: 20,                              // 10pt
          }),
        ],
      }),
    ],
  });
}

// ------------------------------------------------------------
// POST /api/v1/export/docx
// ------------------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  try {
    let title, content;

    // 1. Obtain title and content
    if (req.body.draft_id) {
      const draft = await Draft.findById(req.body.draft_id);
      if (!draft) {
        return res.status(404).json({ error: 'Draft not found' });
      }
      title = draft.title;
      content = draft.content;
    } else if (req.body.content && req.body.title) {
      title = req.body.title;
      content = req.body.content;
    } else {
      return res.status(400).json({
        error: 'Either draft_id or both title and content must be provided',
      });
    }

    // 2. Company & date
    const company = req.user?.company || process.env.COMPANY_NAME || 'Our Company';
    const dateStr = new Date().toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // 3. Footer (used on TOC and content pages)
    const footer = createFooter(company);

    // 4. Assemble Word document
    const doc = new Document({
      sections: [
        coverSection(title, company, dateStr),
        tocSection(footer),
        contentSections(content, footer),
      ],
    });

    // 5. Generate buffer and send
    const buffer = await Packer.toBuffer(doc);
    const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bid-${safeTitle}.docx"`
    );
    res.send(buffer);
  } catch (error) {
    console.error('DOCX export error:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

export default router;