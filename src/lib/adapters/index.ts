// Adapter registry. To add a new source:
//   1. Create src/lib/adapters/<source>.ts extending BaseAdapter
//   2. Add it to seed-sources.sql
//   3. Register it here
//
// Adapters not in this registry are silently skipped during ingest,
// even if they're seeded in the `sources` table. This is deliberate —
// we want explicit registration, not magic.

import { BaseAdapter } from "./base";
import { ETendersAdapter } from "./etenders";
import { TreasuryBulletinAdapter } from "./treasury-bulletin";

export const ADAPTERS: BaseAdapter[] = [
  new ETendersAdapter(),
  new TreasuryBulletinAdapter(),
  // TODO: add metro adapters (coj, cct, ethekwini), provincial treasuries, SOEs
  // Each is ~80-150 lines, modeled on etenders.ts. See OPERATIONS.md.
];

export function getAdapter(sourceId: string): BaseAdapter | undefined {
  return ADAPTERS.find((a) => a.sourceId === sourceId);
}
