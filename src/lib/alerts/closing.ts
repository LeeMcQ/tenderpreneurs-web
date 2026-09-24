import { PROVINCE_LABELS } from '../tender-display';

export const SECTORS = [
  'agriculture', 'catering', 'cleaning', 'construction', 'consulting',
  'education', 'energy', 'health', 'ict', 'legal', 'security', 'transport',
] as const;

export type ClosingRule = {
  province: string;
  sector: string;
  within: number;
};

export function sentenceFor(rule: ClosingRule, count?: number): string {
  const place = PROVINCE_LABELS[rule.province] || rule.province || 'Any province';
  const sector = rule.sector ? rule.sector.replace(/-/g, ' ') : 'any sector';
  const days = rule.within || 7;
  const n = count == null ? '' : count === 0 ? 'No open notices. ' : `${count} open. `;
  return `${n}${place} + ${sector} + closes in ${days} days`.replace(/\s+/g, ' ').trim();
}

export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
