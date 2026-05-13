import fs from 'fs';
import path from 'path';

const AUDIT_PATH = './docs/audit.md';
const MODEL = 'deepseek-chat';
const MAX_TOKENS = 8000;

async function main() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY is required.');
    process.exit(1);
  }

  let auditContent;
  try {
    auditContent = fs.readFileSync(AUDIT_PATH, 'utf-8');
  } catch (err) {
    console.error(`Failed to read audit file: ${err.message}`);
    process.exit(1);
  }

  const prompt = `You are writing Playwright tests in TypeScript...\n\nAudit document:\n${auditContent}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: MAX_TOKENS,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API returned ${res.status}: ${err}`);
    }

    const data = await res.json();
    const output = data.choices?.[0]?.message?.content;
    if (!output) throw new Error('No content in API response');

    // Split into file blocks
    const blocks = output.split(/^=== FILE: (.+?) ===$/gm);
    if (blocks.length < 2) {
      console.warn('No file blocks found in output. Output was:', output);
      return;
    }

    // blocks[0] is text before first marker, then pairs of [filename, content]
    for (let i = 1; i < blocks.length; i += 2) {
      const filePath = blocks[i]?.trim();
      const content = blocks[i + 1]?.trim();
      if (!filePath || !content) continue;

      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✓ Wrote ${filePath}`);
    }
    console.log('All files generated successfully.');
  } catch (err) {
    console.error('Generation failed:', err.message);
    process.exit(1);
  }
}

main();