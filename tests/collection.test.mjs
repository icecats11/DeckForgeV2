import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCollectionList, findCommanderCandidates } from "../src/utils/collection.js";
import { parseGeneratedDecklist, repairDeck } from "../api/_lib/deck-validation.js";

// ── parseCollectionList ──────────────────────────────────────────────────────
test("collection: no commander inference — first card stays a normal card", () => {
  const { cards } = parseCollectionList(`1 Meren of Clan Nel Toth
1 Sol Ring`);
  assert.deepEqual(cards.map((c) => c.name).sort(), ["Meren of Clan Nel Toth", "Sol Ring"]);
});

test("collection: bare names without quantities default to qty 1", () => {
  const { cards } = parseCollectionList(`Sol Ring
Arcane Signet`);
  assert.equal(cards.length, 2);
  assert.ok(cards.every((c) => c.qty === 1));
});

test("collection: set codes and foil markers stripped, duplicates merged", () => {
  const { cards } = parseCollectionList(`2 Lightning Bolt (2XM) 129 *F*
2x Lightning Bolt`);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].qty, 4);
});

test("collection: basics separated and total counted", () => {
  const { cards, basics, totalCards } = parseCollectionList(`1 Sol Ring
12 Forest`);
  assert.equal(cards.length, 1);
  assert.equal(basics[0].qty, 12);
  assert.equal(totalCards, 13);
});

// ── findCommanderCandidates ──────────────────────────────────────────────────
function sfEntry(name, { identity = [], type = "Creature", oracle = "" } = {}) {
  return [name.toLowerCase(), {
    name,
    color_identity: identity,
    type_line: type,
    oracle_text: oracle,
    image_uri: null,
  }];
}

test("legendary creatures found and scored by identity support", () => {
  const cards = [
    { qty: 1, name: "Meren of Clan Nel Toth" },
    { qty: 1, name: "Krenko, Mob Boss" },
    { qty: 1, name: "Sakura-Tribe Elder" },
    { qty: 1, name: "Golgari Charm" },
    { qty: 1, name: "Sol Ring" },
  ];
  const sf = new Map([
    sfEntry("Meren of Clan Nel Toth", { identity: ["B", "G"], type: "Legendary Creature — Human Shaman" }),
    sfEntry("Krenko, Mob Boss", { identity: ["R"], type: "Legendary Creature — Goblin Warrior" }),
    sfEntry("Sakura-Tribe Elder", { identity: ["G"], type: "Creature — Snake Shaman" }),
    sfEntry("Golgari Charm", { identity: ["B", "G"], type: "Instant" }),
    sfEntry("Sol Ring", { identity: [], type: "Artifact" }),
  ]);
  const candidates = findCommanderCandidates(cards, sf);
  assert.deepEqual(candidates.map((c) => c.name), ["Meren of Clan Nel Toth", "Krenko, Mob Boss"]);
  assert.equal(candidates[0].supportCount, 3); // Elder [G], Charm [BG], Sol Ring [] fit; Krenko [R] does not
});

test("non-legendary 'can be your commander' cards qualify", () => {
  const cards = [{ qty: 1, name: "Shorikai, Genesis Engine" }];
  const sf = new Map([
    sfEntry("Shorikai, Genesis Engine", {
      identity: ["W", "U"],
      type: "Legendary Artifact — Vehicle",
      oracle: "Shorikai, Genesis Engine can be your commander.",
    }),
  ]);
  assert.equal(findCommanderCandidates(cards, sf).length, 1);
});

// ── repairDeck with allowedSet (collection mode) ─────────────────────────────
function mockCard(name, identity = []) {
  return { name, color_identity: identity, legalities: { commander: "legal" } };
}

test("collection mode: cards outside the collection are removed", () => {
  const parsed = parseGeneratedDecklist(
    ["Commander", "1 Meren of Clan Nel Toth", "", "Deck",
     "1 Sol Ring", "1 Demonic Tutor", "97 Forest"].join("\n")
  );
  const meren = mockCard("Meren of Clan Nel Toth", ["B", "G"]);
  const found = new Map([
    ["sol ring", mockCard("Sol Ring", [])],
    ["demonic tutor", mockCard("Demonic Tutor", ["B"])],
  ]);
  const allowedSet = new Set(["sol ring"]); // player owns Sol Ring only
  const { decklist, report } = repairDeck(parsed, meren, found, { allowedSet });
  assert.ok(report.removed.some((r) => r.card === "Demonic Tutor" && r.reason === "not in your collection"));
  assert.ok(decklist.includes("Sol Ring"));
  assert.ok(!decklist.includes("Demonic Tutor"));
});

test("collection mode: basics are always allowed and used to top up", () => {
  const parsed = parseGeneratedDecklist(
    ["Commander", "1 Meren of Clan Nel Toth", "", "Deck", "1 Sol Ring", "50 Forest"].join("\n")
  );
  const meren = mockCard("Meren of Clan Nel Toth", ["B", "G"]);
  const found = new Map([["sol ring", mockCard("Sol Ring", [])]]);
  const { decklist, report } = repairDeck(parsed, meren, found, { allowedSet: new Set(["sol ring"]) });
  assert.equal(report.addedBasics, 48);
  const total = [...decklist.matchAll(/^(\d+) /gm)]
    .map((m) => parseInt(m[1], 10)).reduce((a, b) => a + b, 0);
  assert.equal(total, 100);
});
