import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGeneratedDecklist, repairDeck } from "../api/_lib/deck-validation.js";

// ── Mock Scryfall helpers ────────────────────────────────────────────────────
function mockCard(name, identity = [], legal = true) {
  return {
    name,
    color_identity: identity,
    legalities: { commander: legal ? "legal" : "not_legal" },
  };
}

function foundMap(cards) {
  return new Map(cards.map((c) => [c.name.toLowerCase(), c]));
}

const MEREN = mockCard("Meren of Clan Nel Toth", ["B", "G"]);

function deck(lines) {
  return parseGeneratedDecklist(
    ["Commander", "1 Meren of Clan Nel Toth", "", "Deck", ...lines].join("\n")
  );
}

// ── parseGeneratedDecklist ───────────────────────────────────────────────────
test("parses commander, non-basics, and basics into separate structures", () => {
  const parsed = deck(["1 Sol Ring", "10 Forest", "8 Swamp"]);
  assert.equal(parsed.commander, "Meren of Clan Nel Toth");
  assert.deepEqual([...parsed.cards.keys()], ["Sol Ring"]);
  assert.equal(parsed.basics.get("Forest"), 10);
  assert.equal(parsed.basics.get("Swamp"), 8);
});

// ── repairDeck ───────────────────────────────────────────────────────────────
test("hallucinated cards are removed and reported", () => {
  const parsed = deck(["1 Sol Ring", "1 Totally Fake Card", "97 Forest"]);
  const found = foundMap([mockCard("Sol Ring", [])]);
  const { report } = repairDeck(parsed, MEREN, found);
  assert.ok(report.removed.some((r) => r.card === "Totally Fake Card" && r.reason === "not a real card"));
});

test("cards outside colour identity are removed", () => {
  const parsed = deck(["1 Sol Ring", "1 Lightning Bolt", "97 Forest"]);
  const found = foundMap([mockCard("Sol Ring", []), mockCard("Lightning Bolt", ["R"])]);
  const { report, decklist } = repairDeck(parsed, MEREN, found);
  assert.ok(report.removed.some((r) => r.card === "Lightning Bolt" && r.reason === "outside colour identity"));
  assert.ok(!decklist.includes("Lightning Bolt"));
});

test("cards not legal in Commander are removed", () => {
  const parsed = deck(["1 Shahrazad", "98 Forest"]);
  const found = foundMap([mockCard("Shahrazad", [], false)]);
  const { report } = repairDeck(parsed, MEREN, found);
  assert.ok(report.removed.some((r) => r.card === "Shahrazad" && r.reason === "not legal in Commander"));
});

test("singleton rule enforced with a note", () => {
  const parsed = deck(["3 Sol Ring", "96 Forest"]);
  const found = foundMap([mockCard("Sol Ring", [])]);
  const { report, decklist } = repairDeck(parsed, MEREN, found);
  assert.ok(report.notes.some((n) => n.includes("singleton")));
  assert.match(decklist, /^1 Sol Ring$/m);
});

test("basics outside identity are removed; deck topped up with identity basics", () => {
  const parsed = deck(["1 Sol Ring", "50 Forest", "48 Island"]);
  const found = foundMap([mockCard("Sol Ring", [])]);
  const { report, decklist } = repairDeck(parsed, MEREN, found);
  assert.ok(report.removed.some((r) => r.reason === "basic outside colour identity"));
  assert.equal(report.addedBasics, 48); // Islands removed → refilled to 99
  assert.ok(!/\bIsland\b/.test(decklist));
});

test("deck totals exactly 99 after repair (short deck gets basics added)", () => {
  const parsed = deck(["1 Sol Ring", "80 Forest"]); // only 81 cards
  const found = foundMap([mockCard("Sol Ring", [])]);
  const { decklist, report } = repairDeck(parsed, MEREN, found);
  assert.equal(report.addedBasics, 18);
  const total = [...decklist.matchAll(/^(\d+) /gm)]
    .map((m) => parseInt(m[1], 10))
    .reduce((a, b) => a + b, 0);
  assert.equal(total, 100); // 1 commander + 99
});

test("oversized deck is trimmed back to 99, basics first", () => {
  const parsed = deck(["1 Sol Ring", "1 Cultivate", "105 Forest"]); // 107 cards
  const found = foundMap([mockCard("Sol Ring", []), mockCard("Cultivate", ["G"])]);
  const { decklist, report } = repairDeck(parsed, MEREN, found);
  assert.equal(report.trimmed, 8);
  assert.ok(decklist.includes("Sol Ring")); // spells survive; basics absorb the cut
  assert.ok(decklist.includes("Cultivate"));
  const total = [...decklist.matchAll(/^(\d+) /gm)]
    .map((m) => parseInt(m[1], 10))
    .reduce((a, b) => a + b, 0);
  assert.equal(total, 100);
});

test("duplicate of the commander in the 99 is removed", () => {
  const parsed = deck(["1 Meren of Clan Nel Toth", "1 Sol Ring", "97 Forest"]);
  const found = foundMap([MEREN, mockCard("Sol Ring", [])]);
  const { report } = repairDeck(parsed, MEREN, found);
  assert.ok(report.removed.some((r) => r.reason === "duplicate of commander"));
});

test("colourless commander tops up with Wastes", () => {
  const kozilek = mockCard("Kozilek, Butcher of Truth", []);
  const parsed = parseGeneratedDecklist(
    ["Commander", "1 Kozilek, Butcher of Truth", "", "Deck", "1 Sol Ring", "90 Wastes"].join("\n")
  );
  const found = foundMap([mockCard("Sol Ring", [])]);
  const { decklist, report } = repairDeck(parsed, kozilek, found);
  assert.equal(report.addedBasics, 8);
  assert.match(decklist, /98 Wastes/);
});
