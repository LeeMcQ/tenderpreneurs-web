// src/data/testimonials.ts
// Add real testimonials here as you collect them.
// While this array is empty, the <Testimonials /> component renders NOTHING —
// no placeholder boxes will appear on the live site.
//
// When you add your first quote, the testimonials section appears automatically
// on every page that uses <Testimonials />.
//
// ─── Honest content guidelines ────────────────────────────────
// 1. Use a real name, role, and company.
// 2. Don't paraphrase — copy the quote exactly as the person sent it.
// 3. Get written permission (WhatsApp screenshot is fine) and keep it on file.
// 4. Avoid generic praise. Specific wins ("won a R450k municipal bid") beat
//    vague enthusiasm ("great product!") every time.
// 5. If you only have one real quote, ship one — don't pad with placeholders.

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  location?: string;        // "Cape Town, WC"
  avatarUrl?: string;       // optional headshot, square preferred
  outcome?: string;         // optional: "Won R450k DPSA bid" — appears as a chip
  consentDate?: string;     // YYYY-MM-DD — internal record, not displayed
}

export const TESTIMONIALS: Testimonial[] = [
  // ─── EXAMPLE (commented out — uncomment and edit when you have a real quote) ───
  // {
  //   quote:
  //     "I'd been bidding on government tenders for two years with nothing to show for it. The PFMA Knowledge Base walked me through the SBD forms in one afternoon. Won my first municipal contract three weeks later.",
  //   name: "Thandiwe N.",
  //   role: "Founder",
  //   company: "Khanya Cleaning Services",
  //   location: "Khayelitsha, WC",
  //   outcome: "First municipal bid won — R180k",
  //   consentDate: "2026-02-01",
  // },
];

// Helper used by the component to skip rendering on empty.
export const HAS_TESTIMONIALS = TESTIMONIALS.length > 0;
