// Pure decklist parsing + repair logic for AI-generated decks.
// No network calls in this file — generate.js fetches the Scryfall data and
// passes it in, which keeps everything here unit-testable (see tests/).

export const BASIC_LAND_NAMES = new Set([
  "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
  "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
  "Snow-Covered Mountain", "Snow-Covered Forest", "Snow-Covered Wastes",
]);

export const IDENTITY_TO_BASIC = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };

export function isWithinIdentity(card, identitySet) {
  return (card.color_identity ?? []).every((c) => identitySet.has(c));
}

export function isCommanderLegal(card) {
  return card?.legalities?.commander === "legal";
}

/** Parse the strict "Commander / Deck" format the generator asks Claude for. */
export function parseGeneratedDecklist(text) {
  const lines = text.split(/\r?\n/);
  let section = null;
  let commander = null;
  const cards = new Map();   // name -> qty (non-basics)
  const basics = new Map();  // name -> qty

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase().replace(/:$/, "");
    if (lower === "commander") { section = "commander"; continue; }
    if (lower === "deck")      { section = "deck"; continue; }

    const m = line.match(/^(\d+)[xX]?\s+(.+)$/);
    if (!m) continue;
    const qty = parseInt(m[1], 10);
    const name = m[2].trim();

    if (section === "commander" && !commander) {
      commander = name;
    } else if (BASIC_LAND_NAMES.has(name)) {
      basics.set(name, (basics.get(name) ?? 0) + qty);
    } else {
      cards.set(name, (cards.get(name) ?? 0) + qty);
    }
  }

  return { commander, cards, basics };
}

/**
 * Repair a parsed generated deck against verified Scryfall data.
 *
 * @param parsed        result of parseGeneratedDecklist()
 * @param commanderCard verified Scryfall card object for the commander
 * @param found         Map<lowercaseName, scryfallCard> of verified cards
 * @param options       { allowedSet?: Set<lowercaseName> } — when present,
 *                      cards outside the set are removed (collection mode).
 *                      Basics are always allowed.
 * @returns { decklist, report }
 */
export function repairDeck(parsed, commanderCard, found, options = {}) {
  const allowedSet = options.allowedSet ?? null;
  const report = { removed: [], addedBasics: 0, trimmed: 0, notes: [] };
  const { cards, basics } = parsed;

  const canonicalCommander = commanderCard.name;
  const identity = new Set(commanderCard.color_identity ?? []);

  // Verify every non-basic card
  const validCards = new Map();
  for (const [name, qty] of cards) {
    const card = found.get(name.toLowerCase());
    if (!card) {
      report.removed.push({ card: name, reason: "not a real card" });
      continue;
    }
    if (!isCommanderLegal(card)) {
      report.removed.push({ card: card.name, reason: "not legal in Commander" });
      continue;
    }
    if (!isWithinIdentity(card, identity)) {
      report.removed.push({ card: card.name, reason: "outside colour identity" });
      continue;
    }
    if (card.name.toLowerCase() === canonicalCommander.toLowerCase()) {
      report.removed.push({ card: card.name, reason: "duplicate of commander" });
      continue;
    }
    if (allowedSet &&
        !allowedSet.has(card.name.toLowerCase()) &&
        !allowedSet.has(name.toLowerCase())) {
      report.removed.push({ card: card.name, reason: "not in your collection" });
      continue;
    }
    if (qty > 1) report.notes.push(`Reduced ${card.name} from ${qty} to 1 (singleton rule).`);
    validCards.set(card.name, 1);
  }

  // Filter basics to identity colours (a mono-red deck listing Islands, etc.)
  const validBasics = new Map();
  for (const [name, qty] of basics) {
    const baseName = name.replace(/^Snow-Covered /, "");
    const colour = Object.entries(IDENTITY_TO_BASIC).find(([, b]) => b === baseName)?.[0];
    const ok = baseName === "Wastes" ? true : colour && identity.has(colour);
    if (ok) validBasics.set(name, qty);
    else report.removed.push({ card: `${qty}x ${name}`, reason: "basic outside colour identity" });
  }

  // Rebalance to exactly 99
  let total =
    [...validCards.values()].reduce((a, b) => a + b, 0) +
    [...validBasics.values()].reduce((a, b) => a + b, 0);

  if (total < 99) {
    const fillColours = identity.size > 0 ? [...identity] : null;
    let deficit = 99 - total;
    report.addedBasics = deficit;
    if (fillColours) {
      let i = 0;
      while (deficit > 0) {
        const basic = IDENTITY_TO_BASIC[fillColours[i % fillColours.length]];
        validBasics.set(basic, (validBasics.get(basic) ?? 0) + 1);
        deficit--; i++;
      }
    } else {
      validBasics.set("Wastes", (validBasics.get("Wastes") ?? 0) + deficit);
    }
  } else if (total > 99) {
    // Trim basics first, then excess non-basics
    let excess = total - 99;
    report.trimmed = excess;
    for (const [name, qty] of validBasics) {
      if (excess <= 0) break;
      const cut = Math.min(qty - (validBasics.size === 1 ? 1 : 0), excess);
      if (cut > 0) { validBasics.set(name, qty - cut); excess -= cut; }
    }
    if (excess > 0) {
      const keys = [...validCards.keys()];
      while (excess > 0 && keys.length) {
        const name = keys.pop();
        validCards.delete(name);
        report.removed.push({ card: name, reason: "trimmed to reach 99 cards" });
        excess--;
      }
    }
  }

  // Rebuild the decklist text
  const lines = ["Commander", `1 ${canonicalCommander}`, "", "Deck"];
  for (const [name, qty] of validCards) lines.push(`${qty} ${name}`);
  for (const [name, qty] of validBasics) if (qty > 0) lines.push(`${qty} ${name}`);

  return { decklist: lines.join("\n"), report };
}
