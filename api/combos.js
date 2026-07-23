import { applyCors } from "./_lib/http.js";
import { checkRateLimit } from "./_lib/ratelimit.js";

// Deterministic combo detection via Commander Spellbook's free API.
// This is community-verified combo data — far more reliable than asking
// an LLM to spot combos. Returns:
//   included:       combos fully present in the deck
//   almostIncluded: combos one card away (great upgrade suggestions)
// Proxied server-side to avoid any browser CORS issues and to keep one
// place to adapt if the upstream response shape changes.

const SPELLBOOK_URL = "https://backend.commanderspellbook.com/find-my-combos";

function cardNamesOf(combo) {
  // Defensive: entries have been observed as { card: { name } } objects;
  // fall back to plain strings or { name } just in case.
  return (combo?.uses ?? [])
    .map((u) => u?.card?.name ?? u?.name ?? (typeof u === "string" ? u : null))
    .filter(Boolean);
}

function producesOf(combo) {
  return (combo?.produces ?? [])
    .map((p) => p?.feature?.name ?? p?.name ?? (typeof p === "string" ? p : null))
    .filter(Boolean);
}

function simplify(combo) {
  return {
    id: combo?.id ?? null,
    cards: cardNamesOf(combo),
    produces: producesOf(combo),
    url: combo?.id ? `https://commanderspellbook.com/combo/${combo.id}` : null,
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkRateLimit(req, res, { max: 10, name: "combos" })) return;

  const { commanders, main } = req.body || {};
  if (!Array.isArray(main) || main.length === 0 || main.length > 300) {
    return res.status(400).json({ error: "main must be a non-empty array of card names." });
  }

  try {
    const upstream = await fetch(SPELLBOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "DeckForge/1.0 (thedeckforge.co.uk)",
      },
      body: JSON.stringify({
        commanders: (commanders ?? []).slice(0, 2).map(String),
        main: main.slice(0, 300).map(String),
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Commander Spellbook returned ${upstream.status}` });
    }

    const data = await upstream.json();
    const results = data?.results ?? data ?? {};

    return res.status(200).json({
      included: (results.included ?? []).map(simplify),
      almostIncluded: (results.almostIncluded ?? []).slice(0, 8).map(simplify),
    });
  } catch (err) {
    console.error("Combos error:", err);
    return res.status(502).json({ error: "Could not reach Commander Spellbook." });
  }
}
