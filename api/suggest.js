import Anthropic from "@anthropic-ai/sdk";
import { applyCors, extractText } from "./_lib/http.js";
import { checkRateLimit } from "./_lib/ratelimit.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cost control: the frontend does the heavy lifting (Scryfall lookups,
// commander candidate detection, identity scoring) and sends only a compact
// summary — card NAMES, no oracle text. These caps keep a malicious or
// enormous payload from turning into a huge token bill.
const MAX_CANDIDATES = 15;
const MAX_COLLECTION_NAMES = 700;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkRateLimit(req, res, { max: 3, name: "suggest" })) return;

  const { candidates, collection } = req.body || {};
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: "No commander candidates found in the collection." });
  }
  if (!Array.isArray(collection) || collection.length < 20) {
    return res.status(400).json({ error: "Collection too small — paste at least ~20 distinct cards." });
  }

  const safeCandidates = candidates.slice(0, MAX_CANDIDATES).map((c) => ({
    name: String(c.name ?? "").slice(0, 200),
    identity: Array.isArray(c.identity) ? c.identity.filter((x) => "WUBRG".includes(x)) : [],
    type_line: String(c.type_line ?? "").slice(0, 120),
    supportCount: Math.max(0, parseInt(c.supportCount, 10) || 0),
  }));
  const safeCollection = collection
    .slice(0, MAX_COLLECTION_NAMES)
    .map((n) => String(n).slice(0, 200));

  const candidateBlock = safeCandidates
    .map((c) => `- ${c.name} [${c.identity.join("") || "C"}] (${c.type_line}) — ${c.supportCount} collection cards fit its identity`)
    .join("\n");

  const prompt = `You are an expert Magic: The Gathering Commander deck builder helping a player discover what they can build from cards they ALREADY OWN.

POSSIBLE COMMANDERS IN THEIR COLLECTION (pre-verified as legal commanders, with how many of their owned cards fit each colour identity):
${candidateBlock}

THEIR COLLECTION (card names only${collection.length > MAX_COLLECTION_NAMES ? `; truncated to ${MAX_COLLECTION_NAMES} of ${collection.length}` : ""}):
${safeCollection.join(", ")}

TASK: Suggest 3-5 distinct Commander deck concepts buildable primarily from this collection.

RULES:
- The commander for each concept MUST come from the candidate list above.
- Prefer variety: different colour identities and different archetypes across your suggestions where the collection allows.
- "key_cards" must ONLY be cards from the collection list (8-12 per concept) that genuinely synergise with the commander's game plan.
- "missing_pieces" is up to 5 cheap (under ~£5) cards NOT in the collection that would meaningfully improve the deck.
- Be honest in "completeness": if a concept would need lots of filler, say so.
- "bracket" is your estimate of the finished deck's power bracket (1-5) using standard Commander Brackets.

Return ONLY this exact JSON — no markdown, no explanation:
{
  "suggestions": [
    {
      "commander": "<name from candidate list>",
      "identity": "<e.g. BG>",
      "archetype": "<e.g. Aristocrats>",
      "bracket": "<1|2|3|4|5>",
      "strategy": "<2-3 sentences: game plan and why this collection supports it>",
      "key_cards": ["<from collection>", "..."],
      "missing_pieces": ["<cheap card not in collection>", "..."],
      "completeness": "<one honest sentence on how much of the 99 the collection covers>"
    }
  ]
}`;

  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
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

    // Belt-and-braces: drop any suggestion whose commander isn't a real candidate
    const candidateNames = new Set(safeCandidates.map((c) => c.name.toLowerCase()));
    const suggestions = (parsed.suggestions ?? []).filter(
      (s) => s?.commander && candidateNames.has(String(s.commander).toLowerCase())
    );

    if (!suggestions.length) {
      return res.status(502).json({ error: "No valid suggestions produced — try again." });
    }

    return res.status(200).json({ suggestions });
  } catch (err) {
    console.error("Suggest error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
