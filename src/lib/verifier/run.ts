/**
 * src/lib/verifier/run.ts
 * Single code path used by both the admin endpoint and the cron: load a tender,
 * gather peers + history, run the engine ensemble (if enabled), generate the
 * report, and store a draft. Returns null if the tender is not found.
 */
import { ulid, now } from '../db.ts';
import { generateReport } from './generate.ts';
import { toExternalReport } from './orchestrate.ts';
import { runEnsemble } from './engines.ts';
import corpus from './corpus.json';
import type { PeerStat } from './rules.ts';

function dayspan(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z');
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 86_400_000);
}

export async function runVerificationForTender(
  env: any, tenderId: string, withEngines = true,
): Promise<{ id: string; health_score: number } | null> {
  const t = await env.DB.prepare(
    `SELECT id, source_ref, title, procuring_entity, sector, category, description,
            published_date, closing_date, closing_time, briefing_date, briefing_compulsory,
            cidb_grade, estimated_value, preference_system, contact_name, contact_email,
            contact_phone, documents_json
     FROM tenders WHERE id = ? AND canonical_ref IS NULL`
  ).bind(tenderId).first() as Record<string, any> | null;
  if (!t) return null;

  let documents_count = 0;
  try { const d = JSON.parse(t.documents_json ?? '[]'); documents_count = Array.isArray(d) ? d.length : 0; } catch {}

  const peersRes = await env.DB.prepare(
    `SELECT published_date, closing_date, estimated_value FROM tenders
     WHERE canonical_ref IS NULL AND id != ? AND sector IS ? AND category IS ?
     ORDER BY first_seen_at DESC LIMIT 200`
  ).bind(tenderId, t.sector, t.category).all();
  const peers: PeerStat[] = ((peersRes as any).results ?? []).map((p: any) => ({
    advertising_days: dayspan(p.published_date, p.closing_date),
    estimated_value: p.estimated_value ?? null,
  }));

  const histRes = await env.DB.prepare(
    `SELECT change_type FROM tender_history WHERE tender_id = ? ORDER BY changed_at DESC LIMIT 20`
  ).bind(tenderId).all();
  const history = ((histRes as any).results ?? []) as { change_type?: string }[];

  const tenderObj = {
    id: t.id, source_ref: t.source_ref, title: t.title, procuring_entity: t.procuring_entity,
    category: t.category, description: t.description,
    published_date: t.published_date, closing_date: t.closing_date, closing_time: t.closing_time,
    briefing_date: t.briefing_date, briefing_compulsory: t.briefing_compulsory,
    cidb_grade: t.cidb_grade, estimated_value: t.estimated_value, preference_system: t.preference_system,
    contact_name: t.contact_name, contact_email: t.contact_email, contact_phone: t.contact_phone,
    documents_count,
  };

  let ensemble: { outputs: any[]; used: string[] } = { outputs: [], used: [] };
  if (withEngines) {
    try { ensemble = await runEnsemble(tenderObj as any, corpus, env); }
    catch (e) { console.error('[run] ensemble failed, continuing deterministic:', e); }
  }

  const report = generateReport({
    tender: tenderObj as any,
    subjectWindowDays: dayspan(t.published_date, t.closing_date),
    peers, history, modelOutputs: ensemble.outputs, enginesUsed: ensemble.used,
  });
  const external = toExternalReport(report);

  const id = ulid();
  await env.DB.prepare(
    `INSERT INTO verification_reports
      (id, tender_id, corpus_version, engines_json, report_json, external_json, health_score, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
  ).bind(
    id, tenderId, report.meta.framework_version, JSON.stringify(report.meta.engines_used),
    JSON.stringify(report), JSON.stringify(external), report.health_score, now(), now(),
  ).run();

  return { id, health_score: report.health_score };
}
