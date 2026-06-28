/**
 * src/lib/verifier/workflow.ts
 * Status machine for the admin review queue. PURE / testable.
 *
 *   draft ──approve──► approved ──publish──► published ──send──► sent
 *     │                  │  ▲                   │  ▲
 *   discard            discard reopen         reopen
 *
 * NOTE: the 'send' action (email to an entity) is additionally gated at the
 * endpoint by the POPIA compliance flag + recorded consent. The workflow only
 * says the transition is *structurally* allowed; lawfulness is enforced separately.
 */
export type ReportStatus = 'draft' | 'approved' | 'published' | 'sent' | 'discarded';
export type ReportAction = 'approve' | 'publish' | 'send' | 'discard' | 'reopen';

const TRANSITIONS: Record<ReportStatus, Partial<Record<ReportAction, ReportStatus>>> = {
  draft:     { approve: 'approved', discard: 'discarded' },
  approved:  { publish: 'published', discard: 'discarded', reopen: 'draft' },
  published: { send: 'sent', reopen: 'draft' },
  sent:      { },
  discarded: { reopen: 'draft' },
};

export interface TransitionResult {
  ok: boolean;
  status?: ReportStatus;
  error?: string;
  requires_consent_gate?: boolean;
}

export function nextStatus(current: ReportStatus, action: ReportAction): TransitionResult {
  const allowed = TRANSITIONS[current];
  if (!allowed) return { ok: false, error: `unknown status: ${current}` };
  const next = allowed[action];
  if (!next) return { ok: false, error: `cannot '${action}' from '${current}'` };
  return { ok: true, status: next, requires_consent_gate: action === 'send' };
}
