import Anthropic from "@anthropic-ai/sdk";
import { applyCors, extractText } from "./_lib/http.js";
import { checkRateLimit } from "./_lib/ratelimit.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Server-side caps: the client sends full oracle text, so without these an
// attacker (or a bug) can send arbitrarily large payloads straight into
// paid Claude tokens.
const MAX_CARDS = 110;
const MAX_ORACLE_CHARS = 500;

// ─── EDHREC ──────────────────────────────────────────────────────────────────

function commanderToEdhrecSlug(name) {
  // EDHREC slugs use the front face for DFC commanders ("A // B" → "a")
  // and join partner pairs with a hyphen ("A + B" → "a-b"). Accented
  // characters are transliterated to ASCII.
  const slugPart = (part) =>
    part
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics
      .toLowerCase()
      .replace(/[',\.!:]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

  if (name.includes(" + ")) {
    return name.split(" + ").map((p) => slugPart(p.trim())).join("-");
  }
  return slugPart(name.split("//")[0].trim());
}

async function fetchEdhrecData(commanderName) {
  const slug = commanderToEdhrecSlug(commanderName);
  try {
    const resp = await fetch(
      `https://json.edhrec.com/pages/commanders/${slug}.json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const cardlists = data?.container?.json_dict?.cardlists ?? [];

    const highSynergy = cardlists.find((cl) => cl.header === "High Synergy Cards");
    const topCards    = cardlists.find((cl) => cl.header === "Top Cards");

    const toNames  = (list, n = 10) =>
      (list?.cardviews ?? []).slice(0, n).map((c) => c.name);
    const toLabels = (list, n = 10) =>
      (list?.cardviews ?? []).slice(0, n)
        .map((c) => `${c.name} (synergy: ${(c.synergy * 100).toFixed(0)}%)`);

    return {
      highSynergyNames: toNames(highSynergy, 15),
      topCardNames:     toNames(topCards, 15),
      highSynergyLabel: toLabels(highSynergy),
      topCardLabel:     toLabels(topCards),
    };
  } catch {
    return null;
  }
}

// ─── SYSTEM MESSAGE ───────────────────────────────────────────────────────────

const MTG_SYSTEM = `You are an expert Magic: The Gathering Commander (EDH) deck analyst.

FORMAT RULES:
- 100-card singleton deck (one copy of each card, except basic lands)
- One commander (or two with partner/background) that defines the colour identity
- Commander lives in the command zone; costs {2} more each time it is recast (commander tax)
- 21 combat damage from a single commander eliminates that player
- All non-land cards must be within the commander's colour identity

POWER LEVELS (Bracket 1-5):
1 – Exhibition: Fully thematic, no infinite combos, no tutors, no extra turn spells, low card quality
2 – Core: Synergy-focused, telegraphed and beatable win conditions, minimal fast mana
3 – Upgraded: Strong synergies, consistent wins by turns 9-11, low-cost tutors acceptable, some fast mana
4 – Optimised: Highly consistent, wins turns 7-9, efficient interaction suite, good mana base
5 – cEDH: Fully optimised, wins turns 2-5, best staples, full fetch/dual land base

ARCHETYPES:
- Voltron: Equip/enchant commander for 21 commander damage; needs evasion and protection
- Aristocrats: Value from creatures dying; drains opponents; needs sacrifice outlets, death triggers
- Combo: 2-3 card infinite loops; needs tutors and protection; wins at instant speed ideally
- Control: Counterspells + targeted removal; wins with a late game threat; needs card draw
- Stax: Symmetric hate pieces slow opponents more than you; wins in prolonged games
- Tokens: Create wide boards; needs anthem effects or sacrifice outlets; vulnerable to board wipes
- Tribal: Creature type synergies; quality varies widely by tribe
- Spellslinger: Cast many instants/sorceries; wins via storm, damage triggers, or Thousand-Year Storm style effects
- Reanimator: Fill graveyard cheaply, reanimate expensive threats; needs haste or protection
- Lands: Extra land drops, landfall triggers; wins via Valakut-style damage or massive mana
- Big Mana/Ramp: Accelerate to overwhelming mana advantage; cast game-ending spells

MANA BASE PRINCIPLES:
- Recommended 36-38 total mana sources (lands + rocks + dorks + land ramp)
- Avg CMC above 3.5 needs more ramp than average
- MDFC spell/land cards count as roughly half a land
- Target ~10 ramp pieces for a typical deck
- Removal: aim for at least 8-10 pieces; exile > destroy; instant > sorcery
- Card draw: at least 8-10 sources

SYNERGY ANALYSIS:
- Identify cards that directly enable or multiply the commander's stated abilities
- Note whether the deck has redundancy for its win condition
- Check for commander protection (hexproof, indestructible, counterspells)
- Evaluate whether ramp curve supports when the commander wants to come down

Always cross-reference the full card list before suggesting additions — never recommend a card already present in the deck.`;

// ─── PROMPT BUILDER ──────────────────────────────────────────────────────────

function buildCommanderBlock(commander, commanderData) {
  let block = `Commander: ${commander}`;
  if (commanderData) {
    if (commanderData.mana_cost)  block += `\nMana Cost: ${commanderData.mana_cost}`;
    if (commanderData.type_line)  block += `\nType: ${commanderData.type_line}`;
    if (commanderData.oracle_text) block += `\nCard Text:\n${commanderData.oracle_text}`;
  }
  return block;
}

function buildPrompt(commander, commanderData, cards, basics, edhrecData, expensiveCards) {
  const mdfcLands = cards.filter((c) => {
    const parts = (c.type || "").split("//");
    return parts.length === 2 && !parts[0].trim().includes("Land") && parts[1].trim().includes("Land");
  });

  const cardList = cards
    .map((c) => {
      let line = `${c.qty}x ${c.name} [${c.type || "Unknown"}] CMC${c.cmc ?? "?"}`;
      if (c.oracle) line += `\n   ↳ ${c.oracle}`;
      return line;
    })
    .join("\n");

  const mdfcNote = mdfcLands.length > 0
    ? `\nMDFC land sources (count toward effective land total): ${mdfcLands.map((c) => c.name).join(", ")}`
    : "";

  const edhrecBlock = edhrecData
    ? `\nEDHREC data for ${commander}:
  High-synergy cards: ${edhrecData.highSynergyLabel.join(", ")}
  Top cards played: ${edhrecData.topCardLabel.join(", ")}`
    : "";

  const expensiveBlock = expensiveCards?.length
    ? `\nExpensive cards in this deck (>£12): ${expensiveCards.map((c) => `${c.name} (£${c.price})`).join(", ")}`
    : "";

  const allDeckCardNames = [commander, ...cards.map((c) => c.name)].join(", ");

  return `${buildCommanderBlock(commander, commanderData)}
Basics: ${basics}${mdfcNote}
${edhrecBlock}${expensiveBlock}

Non-land cards:
${cardList}

RULES:
1. "adds" must not include any card already in the deck.
2. "cuts" reasons must not reference cards already in the deck as replacements.
3. "upgrade_path" should give 3 concrete card swaps or additions that would most increase power level, with the bracket impact.
4. "budget_swaps" should only be populated if expensive cards (>£12) exist — suggest cheaper alternatives that serve a similar role.
5. Full deck reference: ${allDeckCardNames}

Return ONLY this exact JSON — no markdown, no explanation:
{
  "rating": <integer 1-10>,
  "bracket": "<1|2|3|4|5>",
  "archetype": "<e.g. Elf Tribal / Aristocrats / Stax / Combo>",
  "summary": "<2-3 sentence overview of strategy and power level>",
  "strengths": ["<strength>", "<strength>", "<strength>"],
  "weaknesses": ["<weakness>", "<weakness>", "<weakness>"],
  "cuts": [
    { "card": "<name>", "reason": "<concise reason>" },
    { "card": "<name>", "reason": "<concise reason>" },
    { "card": "<name>", "reason": "<concise reason>" },
    { "card": "<name>", "reason": "<concise reason>" },
    { "card": "<name>", "reason": "<concise reason>" }
  ],
  "adds": [
    { "card": "<name>", "reason": "<concise reason>" },
    { "card": "<name>", "reason": "<concise reason>" },
    { "card": "<name>", "reason": "<concise reason>" },
    { "card": "<name>", "reason": "<concise reason>" },
    { "card": "<name>", "reason": "<concise reason>" }
  ],
  "upgrade_path": [
    { "action": "<specific swap or addition>", "reason": "<why this improves the deck>", "impact": "<e.g. Bracket 2→3>" },
    { "action": "<specific swap or addition>", "reason": "<why this improves the deck>", "impact": "<e.g. Bracket 2→3>" },
    { "action": "<specific swap or addition>", "reason": "<why this improves the deck>", "impact": "<e.g. Bracket 2→3>" }
  ],
  "budget_swaps": [
    { "out": "<expensive card>", "in": "<budget alternative>", "reason": "<why the alternative works>" }
  ],
  "combo_lines": ["<describe any notable combo lines present or suggested>"],
  "budget_note": "<one sentence on overall price profile>"
}`;
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkRateLimit(req, res, { max: 6, name: "analyse" })) return;

  const { commander, commanderData, cards: rawCards, basics, expensiveCards } = req.body || {};
  if (!commander || typeof commander !== "string" || commander.length > 200 ||
      !Array.isArray(rawCards) || rawCards.length === 0) {
    return res.status(400).json({ error: "Invalid request body: commander and cards are required." });
  }
  if (rawCards.length > MAX_CARDS) {
    return res.status(400).json({ error: `Too many cards (max ${MAX_CARDS}). Is this a Commander deck?` });
  }

  // Sanitise & truncate client-supplied card data before it hits the prompt
  const cards = rawCards.map((c) => ({
    qty: Math.max(1, Math.min(99, parseInt(c.qty, 10) || 1)),
    name: String(c.name ?? "").slice(0, 200),
    type: String(c.type ?? "Unknown").slice(0, 120),
    cmc: typeof c.cmc === "number" ? c.cmc : null,
    oracle: c.oracle ? String(c.oracle).slice(0, MAX_ORACLE_CHARS) : undefined,
  }));

  const edhrecData = await fetchEdhrecData(commander);
  const prompt = buildPrompt(commander, commanderData ?? null, cards, basics || "", edhrecData, expensiveCards ?? []);

  try {
    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: MTG_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const message = await stream.finalMessage();

    const raw = extractText(message);
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: "AI returned invalid JSON.", raw });
    }

    // Belt-and-braces: strip adds/cut reasons referencing in-deck cards
    const deckNames = new Set([
      commander.toLowerCase(),
      ...cards.map((c) => c.name.toLowerCase()),
    ]);

    if (Array.isArray(parsed.adds)) {
      parsed.adds = parsed.adds.filter((a) => !deckNames.has((a.card ?? "").toLowerCase()));
    }
    if (Array.isArray(parsed.cuts)) {
      parsed.cuts = parsed.cuts.map((cut) => {
        let reason = cut.reason ?? "";
        for (const name of deckNames) {
          if (name === (cut.card ?? "").toLowerCase()) continue;
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const pattern = new RegExp(`\\b${escaped}\\b`, "i");
          if (pattern.test(reason)) {
            const displayName = cards.find((c) => c.name.toLowerCase() === name)?.name ?? commander;
            reason = reason.replace(pattern, `${displayName} (already in deck)`);
          }
        }
        return { ...cut, reason };
      });
    }

    // Attach EDHREC missing staples (community data, not Claude's opinion)
    if (edhrecData) {
      const allEdhrecNames = [...edhrecData.highSynergyNames, ...edhrecData.topCardNames];
      const seen = new Set();
      parsed.missing_staples = allEdhrecNames
        .filter((name) => {
          const key = name.toLowerCase();
          if (deckNames.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 10);
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Analysis error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
