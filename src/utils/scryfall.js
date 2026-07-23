const BATCH_SIZE = 75;
const DELAY_MS = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getImageUri(card, faceIndex = 0) {
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces?.[faceIndex]?.image_uris?.normal) return card.card_faces[faceIndex].image_uris.normal;
  return null;
}

function getArtCropUri(card) {
  if (card.image_uris?.art_crop) return card.image_uris.art_crop;
  if (card.card_faces?.[0]?.image_uris?.art_crop) return card.card_faces[0].image_uris.art_crop;
  return null;
}

function getOracleText(card) {
  if (card.oracle_text) return card.oracle_text;
  if (Array.isArray(card.card_faces)) {
    return card.card_faces
      .map((f) => `[${f.name}]: ${f.oracle_text ?? ""}`)
      .join("\n");
  }
  return "";
}

function buildEntry(card) {
  const isDfc = Array.isArray(card.card_faces) && card.card_faces.length >= 2;
  // For MDFCs, mana_cost and colors live on card_faces[0], not the top-level object.
  const frontFace = card.card_faces?.[0];
  return {
    isDfc,
    name: card.name,
    cmc: card.cmc ?? 0,
    mana_cost: card.mana_cost ?? frontFace?.mana_cost ?? "",
    type_line: card.type_line ?? "",
    image_uri: getImageUri(card),
    art_crop_uri: getArtCropUri(card),
    back_image_uri: isDfc ? getImageUri(card, 1) : null,
    price_usd: parseFloat(card.prices?.usd ?? 0) || 0,
    price_eur: parseFloat(card.prices?.eur ?? 0) || 0,
    colors: card.colors ?? frontFace?.colors ?? [],
    color_identity: card.color_identity ?? [],
    produced_mana: card.produced_mana ?? [],
    oracle_text: getOracleText(card),
  };
}

function storeEntry(results, card, entry) {
  // Store under Scryfall's canonical name
  results.set(card.name.toLowerCase(), entry);
  // Store under flavor name if present (e.g. "Argonath, Pillars of the Kings" → The Ozolith)
  if (card.flavor_name) {
    results.set(card.flavor_name.toLowerCase(), entry);
  }
  // For DFCs, also store under the front face name alone
  if (entry.isDfc && card.card_faces?.[0]) {
    const frontName = card.card_faces[0].name.toLowerCase();
    if (frontName !== card.name.toLowerCase()) {
      results.set(frontName, entry);
    }
  }
}

/**
 * Fetch Scryfall card data for a list of card names.
 * Returns a Map<lowercaseName, cardEntry>
 */
export async function fetchScryfallData(cardNames) {
  const results = new Map();
  const batches = [];

  for (let i = 0; i < cardNames.length; i += BATCH_SIZE) {
    batches.push(cardNames.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await sleep(DELAY_MS);

    const batch = batches[i];

    // Scryfall's collection API doesn't reliably match full MDFC names like
    // "Front // Back". Query by the front face name only.
    const identifiers = batch.map((name) => ({
      name: name.includes(" // ") ? name.split(" // ")[0].trim() : name,
    }));

    try {
      const resp = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers }),
      });

      if (!resp.ok) continue;

      const data = await resp.json();

      for (const card of data.data || []) {
        const entry = buildEntry(card);
        storeEntry(results, card, entry);
      }

      // Re-index under every original queried name so lookups always succeed
      // even if the Scryfall canonical name differs (e.g. MDFC "X // Y").
      for (const originalName of batch) {
        const key = originalName.toLowerCase();
        if (!results.has(key)) {
          const frontKey = originalName.includes(" // ")
            ? originalName.split(" // ")[0].trim().toLowerCase()
            : null;
          if (frontKey && results.has(frontKey)) {
            results.set(key, results.get(frontKey));
          }
        }
      }

      // Fallback: cards the collection API couldn't find (e.g. flavor-named cards
      // like "Argonath, Pillars of the Kings" which is stored as "The Ozolith").
      // The fuzzy endpoint matches flavor names; the collection endpoint does not.
      const stillMissing = batch.filter((name) => {
        const key = name.toLowerCase();
        const frontKey = name.includes(" // ") ? name.split(" // ")[0].trim().toLowerCase() : null;
        return !results.has(key) && (!frontKey || !results.has(frontKey));
      });

      for (const name of stillMissing) {
        await sleep(50);
        try {
          const fuzzyResp = await fetch(
            `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
          );
          if (!fuzzyResp.ok) continue;
          const card = await fuzzyResp.json();
          const entry = buildEntry(card);
          storeEntry(results, card, entry);
          // Also index under the original queried name (the flavor name)
          results.set(name.toLowerCase(), entry);
        } catch {
          // skip
        }
      }
    } catch {
      // silently skip failed batches
    }
  }

  return results;
}
