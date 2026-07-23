import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeckList } from "../src/utils/parser.js";

test("sectioned format: commander, cards, and basics parsed", () => {
  const { commander, cards, basics } = parseDeckList(`Commander
1 Yawgmoth, Thran Physician

Deck
1 Sol Ring
1 Dark Ritual
35 Swamp`);
  assert.equal(commander, "Yawgmoth, Thran Physician");
  assert.deepEqual(cards.map((c) => c.name).sort(), ["Dark Ritual", "Sol Ring"]);
  assert.match(basics, /35x Swamp/);
});

test("headerless Moxfield format: first qty-1 card is the commander", () => {
  const { commander, cards } = parseDeckList(`1 Meren of Clan Nel Toth
1 Sakura-Tribe Elder
1 Golgari Rot Farm
10 Forest
10 Swamp`);
  assert.equal(commander, "Meren of Clan Nel Toth");
  assert.equal(cards.length, 2);
});

test("set codes, collector numbers, and foil markers are stripped", () => {
  const { cards } = parseDeckList(`Deck
1 Sol Ring (C21) 263 *F*
1 Arcane Signet (ELD) 331
2x Lightning Bolt (2XM) 129 f`);
  const names = cards.map((c) => c.name).sort();
  assert.deepEqual(names, ["Arcane Signet", "Lightning Bolt", "Sol Ring"]);
  assert.equal(cards.find((c) => c.name === "Lightning Bolt").qty, 2);
});

test("sideboard and maybeboard sections are skipped", () => {
  const { cards } = parseDeckList(`Commander
1 Krenko, Mob Boss

Deck
1 Skirk Prospector

Sideboard
1 Blood Moon

Maybeboard
1 Goblin Recruiter`);
  assert.deepEqual(cards.map((c) => c.name), ["Skirk Prospector"]);
});

test("single-slash MDFC separators normalise to double-slash", () => {
  const { cards } = parseDeckList(`Deck
1 Malakir Rebirth / Malakir Mire`);
  assert.equal(cards[0].name, "Malakir Rebirth // Malakir Mire");
});

test("duplicate lines for the same card merge their quantities", () => {
  const { cards } = parseDeckList(`Deck
1 Sol Ring
1 Sol Ring`);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].qty, 2);
});

test("Snow-Covered Wastes counts as a basic land", () => {
  const { cards, basics } = parseDeckList(`Deck
5 Snow-Covered Wastes
1 Kozilek, Butcher of Truth`);
  assert.equal(cards.length, 1);
  assert.match(basics, /5x Snow-Covered Wastes/);
});

test("commander duplicated in the main deck is deduplicated", () => {
  const { commander, cards } = parseDeckList(`Commander
1 Muldrotha, the Gravetide

Deck
1 Muldrotha, the Gravetide
1 Sol Ring`);
  assert.equal(commander, "Muldrotha, the Gravetide");
  assert.deepEqual(cards.map((c) => c.name), ["Sol Ring"]);
});
