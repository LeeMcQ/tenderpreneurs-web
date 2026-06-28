/**
 * src/lib/verifier/taxonomy.ts
 * The single controlled vocabulary of flaw codes (the specialist catalogues).
 * Used by the engine PROMPT (tells models which codes exist) and the PARSER
 * (validates model output; assigns the authoritative category). PURE.
 *
 * The category here is authoritative — models do not get to choose it, which
 * keeps report routing consistent regardless of model behaviour.
 */
export type FlawCategory = 'legal' | 'process' | 'technical' | 'exploit' | 'anomaly';

export interface TaxonomyEntry { code: string; category: FlawCategory; label: string; }

export const TAXONOMY: TaxonomyEntry[] = [
  // legal
  { code: 'preference_system_missing', category: 'legal', label: 'No preference point system stated' },
  { code: 'preference_system_mismatch', category: 'legal', label: 'Preference system inconsistent with value threshold' },
  { code: 'evaluation_criteria_unlawful', category: 'legal', label: 'Evaluation criteria may be unlawful/disallowed' },
  { code: 'mandatory_advert_elements_missing', category: 'legal', label: 'Mandatory advert elements missing' },
  { code: 'sbd_forms_not_referenced', category: 'legal', label: 'Standard bidding forms not referenced' },
  { code: 'csd_requirement_omitted', category: 'legal', label: 'CSD registration requirement omitted' },
  { code: 'tax_compliance_omitted', category: 'legal', label: 'Tax-compliance requirement omitted' },
  { code: 'subcontracting_setaside_unclear', category: 'legal', label: 'Sub-contracting / set-aside conditions unclear' },
  { code: 'appeal_rights_absent', category: 'legal', label: 'Objection/appeal process absent' },
  { code: 'framework_outdated_reference', category: 'legal', label: 'Outdated legal framework reference' },
  // process
  { code: 'no_closing_date', category: 'process', label: 'No closing date stated' },
  { code: 'closing_no_time', category: 'process', label: 'Closing date has no time' },
  { code: 'closing_before_published', category: 'process', label: 'Closing on/before publication' },
  { code: 'short_advertising_window', category: 'process', label: 'Advertising window too short' },
  { code: 'briefing_after_close', category: 'process', label: 'Briefing on/after closing' },
  { code: 'compulsory_briefing_passed', category: 'process', label: 'Compulsory briefing has passed' },
  { code: 'deviation_or_extension_flag', category: 'process', label: 'Extended/amended after publication' },
  { code: 'evaluation_method_incomplete', category: 'process', label: 'Evaluation method incomplete' },
  { code: 'functionality_threshold_unstated', category: 'process', label: 'Functionality threshold unstated' },
  { code: 'bid_validity_period_unstated', category: 'process', label: 'Bid validity period unstated' },
  { code: 'two_envelope_unclear', category: 'process', label: 'Two-envelope process unclear' },
  { code: 'no_contact_details', category: 'process', label: 'No contact details' },
  // technical
  { code: 'brand_specific_spec', category: 'technical', label: 'Brand-specific specification' },
  { code: 'over_specification', category: 'technical', label: 'Over-specification limiting competition' },
  { code: 'under_specification', category: 'technical', label: 'Under-specified scope' },
  { code: 'quantity_unit_inconsistency', category: 'technical', label: 'Quantity/unit inconsistency' },
  { code: 'unrealistic_delivery_timeline', category: 'technical', label: 'Unrealistic delivery timeline' },
  { code: 'construction_no_cidb', category: 'technical', label: 'Construction without CIDB grade' },
  { code: 'cidb_grade_class_mismatch', category: 'technical', label: 'CIDB grade/class mismatch' },
  { code: 'conflicting_requirements', category: 'technical', label: 'Conflicting requirements' },
  { code: 'unmeasurable_acceptance', category: 'technical', label: 'Unmeasurable acceptance criteria' },
  { code: 'specs_missing', category: 'technical', label: 'Specification/BOQ missing' },
  // exploit
  { code: 'tailored_eligibility', category: 'exploit', label: 'Eligibility appears tailored to one supplier' },
  { code: 'scoring_loophole', category: 'exploit', label: 'Scoring could be gamed' },
  { code: 'jv_fronting_opening', category: 'exploit', label: 'JV/fronting opening' },
  { code: 'info_asymmetry', category: 'exploit', label: 'Information asymmetry between bidders' },
  { code: 'repeat_winner_pattern', category: 'exploit', label: 'Recurring single-winner pattern' },
  { code: 'threshold_splitting', category: 'exploit', label: 'Possible threshold splitting' },
  { code: 'vendor_copied_spec', category: 'exploit', label: 'Spec mirrors one vendor' },
  { code: 'unrealistic_prequal', category: 'exploit', label: 'Pre-qualification excludes capable bidders' },
  // anomaly
  { code: 'value_not_stated', category: 'anomaly', label: 'No estimated value stated' },
  { code: 'peer_value_anomaly', category: 'anomaly', label: 'Value far from comparable tenders' },
  { code: 'peer_window_anomaly', category: 'anomaly', label: 'Window far shorter than peers' },
];

export const VALID_CODES: Set<string> = new Set(TAXONOMY.map(t => t.code));
export const CODE_CATEGORY: Record<string, FlawCategory> =
  Object.fromEntries(TAXONOMY.map(t => [t.code, t.category]));

/** Codes the LLM should focus on (the deterministic ones are caught by rules.ts).
 *  Models may still raise any valid code; these are the judgement-heavy ones. */
export const LLM_FOCUS_CODES = TAXONOMY
  .filter(t => ['evaluation_criteria_unlawful', 'brand_specific_spec', 'over_specification',
    'under_specification', 'conflicting_requirements', 'tailored_eligibility', 'scoring_loophole',
    'jv_fronting_opening', 'vendor_copied_spec', 'unrealistic_prequal', 'unrealistic_delivery_timeline',
    'evaluation_method_incomplete', 'subcontracting_setaside_unclear'].includes(t.code))
  .map(t => t.code);
