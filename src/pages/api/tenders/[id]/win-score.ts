/**
 * Retired. Win-probability scoring was removed from the product.
 * Keep the route so old clients get a clear 410 instead of a 404 HTML page.
 */
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      ok: false,
      retired: true,
      error: "Win-probability scoring has been removed.",
    }),
    {
      status: 410,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    },
  );
