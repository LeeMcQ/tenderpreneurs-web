// Base adapter framework.
// Every source scraper extends BaseAdapter and implements `fetchListings`
// plus optionally `fetchDetail`. The pipeline orchestrator drives them.

import type { Env } from "../db";

/** Raw tender extracted from a source — partially structured. */
export interface RawTender {
  source_id: string;
  source_ref: string;            // the procuring entity's reference number
  source_url: string;            // canonical URL for the listing
  title: string;
  description?: string;
  procuring_entity?: string;
  province?: string;             // slug if the adapter knows it
  category?: "goods" | "services" | "construction" | "other";
  closing_date?: string;         // ISO date
  closing_time?: string;         // HH:MM
  published_date?: string;       // ISO date
  briefing_date?: string;
  briefing_compulsory?: boolean;
  briefing_location?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  cidb_grade?: string;
  estimated_value?: number;      // ZAR cents
  documents?: { filename: string; url: string }[];
  raw_html?: string;             // optional snippet for the audit trail
}

/** Outcome of one scrape run, used by the orchestrator. */
export interface AdapterResult {
  source_id: string;
  ok: boolean;
  items: RawTender[];
  error?: string;
  duration_ms: number;
}

export abstract class BaseAdapter {
  abstract readonly sourceId: string;
  abstract readonly displayName: string;
  abstract readonly type: "national" | "provincial" | "metro" | "soe" | "bulletin";

  /** Implement: fetch and parse the listing index. */
  abstract fetchListings(env: Env): Promise<RawTender[]>;

  /**
   * Optional: enrich a listing by fetching its detail page.
   * The orchestrator calls this for tenders missing critical fields.
   */
  async fetchDetail(_env: Env, _tender: RawTender): Promise<Partial<RawTender>> {
    return {};
  }

  /** Standard wrapper around fetchListings that times and traps errors. */
  async run(env: Env): Promise<AdapterResult> {
    const start = Date.now();
    try {
      const items = await this.fetchListings(env);
      return {
        source_id: this.sourceId,
        ok: true,
        items,
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        source_id: this.sourceId,
        ok: false,
        items: [],
        error: err?.message || String(err),
        duration_ms: Date.now() - start,
      };
    }
  }

  /** Safe fetch helper with a sensible UA and timeout. */
  protected async safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "user-agent": "TenderpreneursBot/1.0 (+https://tenderpreneurs.co.za/bot)",
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      return res;
    } finally {
      clearTimeout(t);
    }
  }
}
