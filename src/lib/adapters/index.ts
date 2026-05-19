/**
 * Adapter registry
 *
 * Maps source IDs (as stored in the `sources` table) to their adapter implementations.
 * Every adapter must implement the BaseAdapter interface.
 *
 * IMPORTANT: The sourceId property on each adapter MUST match the `id` column
 * in the `sources` table, otherwise ingestion_runs won't be linked correctly.
 */

import type { BaseAdapter } from './base.js';
import { ETendersAdapter } from './etenders.js';
import { TreasuryBulletinAdapter } from './treasury-bulletin.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ADAPTERS: BaseAdapter[] = [
  new ETendersAdapter(),
  new TreasuryBulletinAdapter(),
  // Add additional adapters here as they are implemented:
  // new EThekwiniAdapter(),
  // new JohannesburgAdapter(),
  // etc.
];

const ADAPTER_MAP = new Map<string, BaseAdapter>(
  ADAPTERS.map((a) => [a.sourceId, a])
);

/**
 * Returns the adapter for a given source ID, or null if none is registered.
 *
 * @param sourceId - The `id` value from the `sources` table row
 */
export function getAdapter(sourceId: string): BaseAdapter | null {
  return ADAPTER_MAP.get(sourceId) ?? null;
}

/**
 * Returns all registered adapters (used by the ingest cron to run all sources).
 */
export function getAllAdapters(): BaseAdapter[] {
  return ADAPTERS;
}
