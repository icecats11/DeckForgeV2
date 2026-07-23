import { cleanLine, parseLine, BASIC_LAND_NAMES } from "./parser.js";

/**
 * Parse a collection list (any mix of "1 Card", "4x Card (SET) 123 *F*"
 * lines). Unlike parseDeckList, there is NO commander inference and
 * section headers are ignored — it's a flat pile of cards.
 * Returns { cards: [{qty, name}], basics: [{qty, name}], totalCards }.
 */
export function parseCollectionList(raw) {
  const cardMap = new Map();
  const basicsMap = new Map();

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    // Skip anything that looks like a section header rather than a card
    const lower = trimmed.toLowerCase().replace(/:$/, "");
    if (["commander", "deck", "mainboard", "sideboard", "maybeboard", "collection"].includes(lower)) continue;

    const cleaned = cleanLine(trimmed);
    if (!cleaned) continue;
    // Allow bare card names (no quantity) — common in collection exports
    const parsed = parseLine(cleaned) ?? { qty: 1, name: cleaned };
    if (!parsed.name) continue;

    const target = BASIC_LAND_NAMES.has(parsed.name) ? basicsMap : cardMap;
    target.set(parsed.name, (target.get(parsed.name) ?? 0) + parsed.qty);
  }

  const cards = Array.from(cardMap.entries()).map(([name, qty]) => ({ qty, name }));
  const basics = Array.from(basicsMap.entries()).map(([name, qty]) => ({ qty, name }));
  const totalCards =
    cards.reduce((s, c) => s + c.qty, 0) + basics.reduce((s, c) => s + c.qty, 0);

  return { cards, basics, totalCards };
}

function canBeCommander(entry) {
  const front = (entry.type_line ?? "").split("//")[0];
  if (/Legendary/.test(front) && /Creature/.test(front)) return true;
  return /can be your commander/i.test(entry.oracle_text ?? "");
}

/**
 * Find every card in the collection that could legally lead a deck, and
 * score each by how many collection cards fit inside its colour identity.
 * Deterministic — no AI involved. Returns candidates sorted best-first:
 * [{ name, identity, type_line, supportCount }]
 */
export function findCommanderCandidates(cards, scryfallData) {
  const entries = cards
    .map((c) => ({ card: c, sf: scryfallData?.get(c.name.toLowerCase()) }))
    .filter((e) => e.sf);

  const candidates = entries.filter((e) => canBeCommander(e.sf));

  return candidates
    .map(({ sf }) => {
      const identity = new Set(sf.color_identity ?? []);
      let supportCount = 0;
      for (const { sf: other } of entries) {
        if (other === sf) continue;
        const ci = other.color_identity ?? [];
        if (ci.every((c) => identity.has(c))) supportCount++;
      }
      return {
        name: sf.name,
        identity: [...(sf.color_identity ?? [])],
        type_line: sf.type_line ?? "",
        supportCount,
      };
    })
    .sort((a, b) => b.supportCount - a.supportCount);
}
