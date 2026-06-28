/**
 * src/lib/verifier/prompt.ts
 * Builds the identical, constrained prompt every engine receives so their
 * outputs reconcile cleanly. Models may cite ONLY the supplied corpus and use
 * ONLY taxonomy codes. PURE / testable.
 */
import { TAXONOMY } from './taxonomy.ts';
import type { VerifyTender } from './rules.ts';

export interface EnginePrompt { system: string; user: string; }

const SYSTEM = `You are a South African public-procurement reviewer assessing ONE tender.
Report flaws ONLY using the controlled codes provided. You may reference ONLY rules in the
supplied corpus — NEVER invent legislation, section numbers, or codes. Prefer omission over
speculation. Use constructive, non-accusatory wording (an issue is "for the entity's
consideration" or "could invite a challenge", never an allegation of wrongdoing).

Return STRICT JSON only, no prose, no markdown fences:
{"flaws":[{"category":"legal|process|technical|exploit|anomaly","code":"<taxonomy code>",
"severity":"info|warning|critical","message":"<specific, plain English>",
"suggested_fix":"<actionable, lawful>","rule_ref":"<corpus rule_ref or empty>"}]}`;

export function buildEnginePrompt(tender: VerifyTender & { title?: string | null }, corpus: unknown): EnginePrompt {
  const codeList = TAXONOMY.map(t => `${t.code} (${t.category}): ${t.label}`).join('\n');
  const tenderText = JSON.stringify({
    title: tender.title ?? null,
    category: tender.category ?? null,
    description: tender.description ?? null,
    published_date: tender.published_date ?? null,
    closing_date: tender.closing_date ?? null,
    closing_time: tender.closing_time ?? null,
    briefing_date: tender.briefing_date ?? null,
    briefing_compulsory: tender.briefing_compulsory ?? null,
    cidb_grade: tender.cidb_grade ?? null,
    estimated_value_cents: tender.estimated_value ?? null,
    preference_system: tender.preference_system ?? null,
    contact: [tender.contact_name, tender.contact_email, tender.contact_phone].filter(Boolean),
  }, null, 0);

  const user = `CONTROLLED CODES (use only these):
${codeList}

CORPUS (cite only these rule_refs):
${JSON.stringify(corpus)}

TENDER UNDER REVIEW:
${tenderText}

Identify genuine flaws. Output strict JSON per the schema. If none, return {"flaws":[]}.`;

  return { system: SYSTEM, user };
}
