/**
 * src/lib/verifier/generate.ts
 *
 * One call that turns a tender (+ peers, history, optional model outputs) into a
 * stored-shaped VerificationReport. Composes the deterministic rules, peer-anomaly,
 * the multi-model reconciler, and the report builder. PURE / testable.
 *
 * With no model outputs it still produces a full deterministic + data report
 * (engines degrade gracefully) — so the tool works today, before any API keys.
 */
import { runRuleChecks, peerAnomaly, CORPUS_META, type VerifyTender, type Flag, type PeerStat } from './rules.ts';
import {
  reconcile, buildReport,
  type ModelFlawSet, type DeterministicFlaw, type FlawCategory, type TenderRef, type VerificationReport,
} from './orchestrate.ts';

function toDeterministic(flags: Flag[]): DeterministicFlaw[] {
  return flags.map(f => ({
    code: f.id, category: f.category as FlawCategory, severity: f.severity,
    message: f.message, suggested_fix: f.suggested_action, rule_ref: f.rule_ref,
  }));
}

export interface GenerateInput {
  tender: VerifyTender & TenderRef;          // verify fields + id/source_ref/title/procuring_entity
  subjectWindowDays: number | null;          // published→closing span, for peer comparison
  peers: PeerStat[];
  history?: { change_type?: string }[];
  modelOutputs?: ModelFlawSet[];             // empty until engine adapters are wired
  enginesUsed?: string[];
  todayISO?: string;
}

export function generateReport(input: GenerateInput): VerificationReport {
  const ruleFlags = runRuleChecks(input.tender, input.todayISO, input.history ?? []);
  const { flags: peerFlags } = peerAnomaly(
    { advertising_days: input.subjectWindowDays, estimated_value: input.tender.estimated_value ?? null },
    input.peers,
  );
  const deterministic = toDeterministic([...ruleFlags, ...peerFlags]);
  const reconciled = reconcile(input.modelOutputs ?? [], deterministic);

  const ref: TenderRef = {
    id: input.tender.id, source_ref: input.tender.source_ref,
    title: input.tender.title, procuring_entity: input.tender.procuring_entity,
  };
  return buildReport(ref, reconciled, {
    framework_version: CORPUS_META.framework_version,
    disclaimer: CORPUS_META.disclaimer,
    engines_used: input.enginesUsed ?? [],
  });
}
