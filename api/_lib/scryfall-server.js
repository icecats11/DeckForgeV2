// Server-side Scryfall helpers used to validate AI-generated decklists.
// Scryfall asks for a descriptive User-Agent and ~10 requests/sec max.

const SCRYFALL_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "DeckForge/1.0 (thedeckforge.co.uk)",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resolve a single card by (fuzzy) name. Returns the Scryfall card or null. */
export async function fetchCardFuzzy(name) {
  try {
    const resp = await fetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
      { headers: SCRYFALL_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Batch-resolve exact card names via the collection endpoint.
 * Returns { found: Map<lowercaseName, card>, notFound: string[] }.
 */
export async function fetchCollection(names) {
  const found = new Map();
  const notFound = [];

  for (let i = 0; i < names.length; i += 75) {
    if (i > 0) await sleep(120);
    const batch = names.slice(i, i + 75);
    try {
      const resp = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: SCRYFALL_HEADERS,
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        notFound.push(...batch);
        continue;
      }
      const data = await resp.json();
      for (const card of data.data ?? []) {
        found.set(card.name.toLowerCase(), card);
        // Index DFCs under their front-face name too
        const front = card.card_faces?.[0]?.name;
        if (front && front.toLowerCase() !== card.name.toLowerCase()) {
          found.set(front.toLowerCase(), card);
        }
      }
      for (const nf of data.not_found ?? []) {
        if (nf?.name) notFound.push(nf.name);
      }
    } catch {
      notFound.push(...batch);
    }
  }

  return { found, notFound };
}

export function isWithinIdentity(card, identitySet) {
  return (card.color_identity ?? []).every((c) => identitySet.has(c));
}

export function isCommanderLegal(card) {
  return card?.legalities?.commander === "legal";
}
