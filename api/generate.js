import Anthropic from "@anthropic-ai/sdk";
import { applyCors, extractText } from "./_lib/http.js";
import { checkRateLimit } from "./_lib/ratelimit.js";
import { fetchCardFuzzy, fetchCollection } from "./_lib/scryfall-server.js";
import { parseGeneratedDecklist, repairDeck } from "./_lib/deck-validation.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BRACKET_GUIDES = {
  "1": "Exhibition — theme and creativity over power; no Game Changers, no mass land denial, no extra turns, no two-card infinite combos; games should last at least nine turns; choose a fun or unusual commander and build a deck that showcases a creative idea",
  "2": "Core — mechanically focused with some entertainment value; no Game Changers, no mass land denial, no chaining extra turns, no two-card infinite combos; clear synergies that are telegraphed and incremental; games should last at least eight turns",
  "3": "Upgraded — strong synergy and high card quality; up to three Game Changers allowed; no mass land denial, no chaining extra turns, no two-card combos before turn six; coherent game plan with multiple synergies and the ability to win in a single turn; games should last at least six turns",
  "4": "Optimised — lethal, consistent, and fast; designed to take players down as fast as possible while still avoiding cEDH metagame strategies; multiple overlapping combos allowed; games should last at least four turns",
  "5": "cEDH — meticulously designed for the competitive Commander metagame; optimised for efficiency and consistency; fast mana (Mana Crypt, Mana Vault, etc.), efficient win conditions, tight interaction; victory is the only consideration",
};

// ─── Validation & auto-repair ────────────────────────────────────────────────
//
// LLM-generated decklists routinely contain hallucinated cards, colour
// identity violations, and off-by-a-few card counts. Rather than shipping
// that to the user, we verify every card against Scryfall, drop anything
// invalid, and top the deck back up to 99 with basics in the commander's
// colours. The report is returned so the frontend can log what changed.

async function validateAndRepair(decklist, allowedNames = null) {
  const parsed = parseGeneratedDecklist(decklist);
  if (!parsed.commander) return { decklist, report: null };

  const commanderCard = await fetchCardFuzzy(parsed.commander);
  if (!commanderCard) {
    return {
      decklist,
      report: { removed: [], addedBasics: 0, trimmed: 0,
        notes: [`Could not verify commander "${parsed.commander}" on Scryfall.`] },
    };
  }

  const { found } = await fetchCollection(Array.from(parsed.cards.keys()));
  const allowedSet = allowedNames
    ? new Set(allowedNames.map((n) => n.toLowerCase()))
    : null;
  return repairDeck(parsed, commanderCard, found, { allowedSet });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkRateLimit(req, res, { max: 4, name: "generate" })) return;

  const { bracket, commander, collection } = req.body || {};
  if (!["1", "2", "3", "4", "5"].includes(String(bracket))) {
    return res.status(400).json({ error: "bracket must be 1–5" });
  }
  if (commander != null && (typeof commander !== "string" || commander.length > 120)) {
    return res.status(400).json({ error: "Invalid commander name." });
  }
  let allowedNames = null;
  if (collection != null) {
    if (!Array.isArray(collection) || collection.length < 20 || collection.length > 800) {
      return res.status(400).json({ error: "collection must be an array of 20-800 card names." });
    }
    allowedNames = collection.map((n) => String(n).slice(0, 200));
  }

  const guide = BRACKET_GUIDES[String(bracket)];

  // If the user chose a commander, verify it first and feed Claude the real
  // card — this massively reduces identity violations in the generated list.
  let commanderBlock = `Choose an interesting commander that fits this power level — pick something different each time, not always the most obvious choice.`;
  if (commander?.trim()) {
    const card = await fetchCardFuzzy(commander.trim());
    if (!card) {
      return res.status(400).json({ error: `Could not find a card named "${commander.trim()}" on Scryfall.` });
    }
    const typeLine = card.type_line ?? "";
    const canBeCommander =
      /Legendary/.test(typeLine) ||
      /can be your commander/i.test(card.oracle_text ?? "");
    if (!canBeCommander) {
      return res.status(400).json({ error: `${card.name} can't be a commander (must be a legendary creature or say it can be your commander).` });
    }
    commanderBlock = `Use exactly this commander:
Name: ${card.name}
Colour identity: ${(card.color_identity ?? []).join("") || "Colourless"}
Type: ${typeLine}
Card text:
${card.oracle_text ?? card.card_faces?.map((f) => f.oracle_text).join("\n") ?? ""}

Build the 99 around this commander's strategy.`;
  }

  const collectionBlock = allowedNames
    ? `

COLLECTION CONSTRAINT — CRITICAL:
The player owns ONLY the following cards. Every non-basic-land card in the deck MUST come from this list (basic lands are always available in any quantity). Do not include any card not on this list. If the collection can't fill all 99 slots within the colour identity, use more basic lands rather than inventing cards.
Owned cards: ${allowedNames.join(", ")}`
    : "";

  const prompt = `You are an expert Magic: The Gathering Commander deck builder. Generate a complete, real, playable 100-card Commander deck targeting bracket ${bracket} (${guide}).

${commanderBlock}${collectionBlock}

DECK CONSTRUCTION GUIDELINES (follow these ratios for a well-balanced deck):
- Lands: 36-38 (increase toward 38 if the commander costs 5+ mana; decrease toward 36 for low-curve or aggressive strategies)
- Ramp: 8-12 cards (mana rocks, land ramp, cost reducers)
- Card draw / card advantage: 8-10 cards
- Removal & interaction: 8-10 cards total (at least 2 board wipes, 3-4 targeted removal pieces, 3-4 defensive/reactive pieces)
- Win conditions: at least 7 cards that can close out the game
- Remaining slots: synergy pieces, support cards, and flex slots specific to the strategy

STRICT RULES:
- Use only real Magic: The Gathering cards with their exact correct names
- Total must be exactly 100 cards: 1 commander + 99 deck cards
- COLOUR IDENTITY: Every single card in the deck — including all lands — must be within the commander's colour identity. A card's colour identity includes mana symbols in its rules text and colour indicators, not just its casting cost. For example, a mono-red commander cannot include Sulfur Falls, Steam Vents, or any land with a blue mana symbol anywhere on the card.
- For mono-colour commanders: use basic lands of that colour plus colourless utility lands (e.g. Command Tower, Reliquary Tower) — never dual lands of other colours.
- List basic lands as a single line with quantity (e.g. "15 Forest")
- No card (except basic lands) may appear more than once
- Return ONLY the decklist in the format below — no explanation, no commentary

Commander
1 [Commander Name]

Deck
[qty] [Card Name]
[qty] [Card Name]
...`;

  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const message = await stream.finalMessage();

    const rawDecklist = extractText(message);
    if (!rawDecklist) return res.status(502).json({ error: "No decklist returned." });

    // Verify every card against Scryfall and repair the list
    const { decklist, report } = await validateAndRepair(rawDecklist, allowedNames);

    return res.status(200).json({ decklist, validation: report });
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
