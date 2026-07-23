import { useRef, useState, useEffect } from "react";
import { fetchScryfallData } from "../utils/scryfall.js";
import { priceGbp } from "../utils/price.js";
import FeedbackModal from "./FeedbackModal.jsx";

// ─── Interaction analysis ────────────────────────────────────────────────────
function analyzeInteractions(parsedCards, scryfallData) {
  let removal = 0, boardWipes = 0, counterspells = 0, graveyardHate = 0, draw = 0, protection = 0;
  for (const card of parsedCards) {
    const sf = scryfallData?.get(card.name.toLowerCase());
    const oracle = (sf?.oracle_text ?? "").toLowerCase();
    const typeLine = (sf?.type_line ?? "").toLowerCase();
    const frontType = typeLine.split("//")[0].trim();
    if (frontType.startsWith("land")) continue;
    const qty = card.qty;

    if (
      oracle.includes("destroy all") || oracle.includes("exile all creatures") ||
      oracle.includes("exile all permanents") || oracle.includes("exile all nonland") ||
      (oracle.includes("each player") && oracle.includes("sacrifice") && oracle.includes("creature"))
    ) {
      boardWipes += qty;
    } else if (
      oracle.includes("counter target spell") || oracle.includes("counter target creature") ||
      oracle.includes("counter target noncreature") || oracle.includes("counter target activated")
    ) {
      counterspells += qty;
    } else if (
      oracle.includes("exile target creature") || oracle.includes("exile target permanent") ||
      oracle.includes("exile target artifact") || oracle.includes("exile target enchantment") ||
      oracle.includes("destroy target creature") || oracle.includes("destroy target permanent") ||
      oracle.includes("destroy target artifact") || oracle.includes("destroy target enchantment") ||
      oracle.includes("destroy target nonland") ||
      (oracle.includes("return target") && oracle.includes("to its owner's hand")) ||
      (oracle.includes("put target") && oracle.includes("on top of its owner's library"))
    ) {
      removal += qty;
    }

    if (oracle.includes("exile") && (oracle.includes("graveyard") || oracle.includes("from all graveyards"))) {
      graveyardHate += qty;
    }
    if (oracle.includes("draw a card") || oracle.includes("draw two") || oracle.includes("draw three") ||
        oracle.includes("draw x") || (oracle.includes("draw") && oracle.includes("cards"))) {
      draw += qty;
    }
    if (oracle.includes("hexproof") || oracle.includes("indestructible") ||
        (oracle.includes("protection from") && !oracle.includes("loses protection")) ||
        oracle.includes("shroud")) {
      protection += qty;
    }
  }
  return { removal, boardWipes, counterspells, graveyardHate, draw, protection };
}

function interactionRating(total, thresholds) {
  if (total >= thresholds[1]) return { label: "Good",     color: "var(--green)" };
  if (total >= thresholds[0]) return { label: "Adequate", color: "var(--gold)"  };
  return                             { label: "Low",      color: "var(--red)"   };
}

function scryfallLink(name) {
  return `https://scryfall.com/search?q=!"${encodeURIComponent(name)}"`;
}

const WUBRG_ORDER = ["W", "U", "B", "R", "G"];

const COLOUR_COMBO_NAMES = {
  "":       "Colorless",
  "W":      "Mono-White",  "U":    "Mono-Blue",  "B":    "Mono-Black",
  "R":      "Mono-Red",    "G":    "Mono-Green",
  "WU":     "Azorius",     "UB":   "Dimir",      "BR":   "Rakdos",
  "RG":     "Gruul",       "GW":   "Selesnya",   "WB":   "Orzhov",
  "UR":     "Izzet",       "BG":   "Golgari",    "WR":   "Boros",
  "UG":     "Simic",
  "WUB":    "Esper",       "UBR":  "Grixis",     "BRG":  "Jund",
  "WRG":    "Naya",        "WUG":  "Bant",       "WBG":  "Abzan",
  "WUR":    "Jeskai",      "UBG":  "Sultai",     "WBR":  "Mardu",
  "URG":    "Temur",
  "WUBR":   "Witch-Maw",   "UBRG": "Glint-Eye",  "WBRG": "Dune-Brood",
  "WUBG":   "Yore-Tiller", "WURG": "Ink-Treader",
  "WUBRG":  "Five-Colour",
};

function getColourIdentityName(colorIdentity) {
  const sorted = [...colorIdentity].sort(
    (a, b) => WUBRG_ORDER.indexOf(a) - WUBRG_ORDER.indexOf(b)
  );
  return COLOUR_COMBO_NAMES[sorted.join("")] ?? sorted.join("");
}

function ManaSymbol({ colour }) {
  return (
    <img
      src={`https://svgs.scryfall.io/card-symbols/${colour}.svg`}
      alt={colour}
      className="mana-symbol"
    />
  );
}

const BASIC_LAND_IMAGES = {
  "plains":   "https://cards.scryfall.io/normal/front/2/d/2dfe1926-c0d5-40a2-b1aa-988524aefc31.jpg?1771345154",
  "island":   "https://cards.scryfall.io/normal/front/8/3/836f371b-34f5-40e8-a806-e457841e5bc7.jpg?1771345160",
  "swamp":    "https://cards.scryfall.io/normal/front/e/4/e43ac31a-942e-4871-be29-426e19e52701.jpg?1771345166",
  "mountain": "https://cards.scryfall.io/normal/front/0/2/021fa322-f38c-4d94-8122-5b13425106d9.jpg?1771345172",
  "forest":   "https://cards.scryfall.io/normal/front/3/b/3b84ec1e-ccce-4b8b-9302-b26f84cfa469.jpg?1771345178",
};

function RatingRing({ rating }) {
  const size = 80;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const fraction = rating / 10;
  const dash = fraction * circ;

  let colour = "#c87f7f"; // red
  if (rating >= 8) colour = "#c8a96e";
  else if (rating >= 6) colour = "#7fc87f";
  else if (rating >= 4) colour = "#7fb8d4";

  return (
    <div className="rating-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        <text
          x={size / 2}
          y={size / 2 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={colour}
          fontSize="20"
          fontFamily="Cinzel, serif"
          fontWeight="700"
        >
          {rating}
        </text>
      </svg>
    </div>
  );
}

function CardLink({ name, scryfallData }) {
  const imgRef = useRef(null);
  const [showBack, setShowBack] = useState(false);
  const info = scryfallData?.get(name.toLowerCase());
  const frontUrl = info?.image_uri ?? BASIC_LAND_IMAGES[name.toLowerCase()] ?? null;
  const backUrl = info?.back_image_uri ?? null;
  const imgUrl = showBack ? backUrl : frontUrl;

  function handleMouseMove(e) {
    if (!imgRef.current) return;
    const img = imgRef.current;
    img.style.display = "block";
    img.style.left = `${e.clientX + 16}px`;
    img.style.top = `${Math.max(10, e.clientY - 100)}px`;
  }

  function handleMouseLeave() {
    if (imgRef.current) imgRef.current.style.display = "none";
  }

  return (
    <span
      style={{ display: "inline" }}
      onMouseMove={imgUrl ? handleMouseMove : undefined}
      onMouseLeave={imgUrl ? handleMouseLeave : undefined}
    >
      <a
        href={scryfallLink(name)}
        target="_blank"
        rel="noopener noreferrer"
        className="card-name-link"
      >
        {name}
      </a>
      {backUrl && (
        <button
          className="flip-btn"
          title={showBack ? "Show front face" : "Show back face"}
          onMouseEnter={(e) => { e.stopPropagation(); setShowBack((v) => !v); }}
          onClick={(e) => { e.preventDefault(); setShowBack((v) => !v); }}
        >
          ⟳
        </button>
      )}
      {imgUrl && (
        <img
          ref={imgRef}
          src={imgUrl}
          alt={name}
          className="card-preview-img"
          style={{ display: "none", position: "fixed", width: 200, borderRadius: 10 }}
        />
      )}
    </span>
  );
}

const TYPE_ORDER = ["Creature", "Instant", "Sorcery", "Planeswalker", "Artifact", "Enchantment", "Land", "Other"];

function getTypeGroup(typeLine) {
  if (!typeLine || typeLine === "Unknown") return "Other";
  for (const t of TYPE_ORDER) {
    if (typeLine.includes(t)) return t;
  }
  return "Other";
}

function groupCardsByType(cards, scryfallData) {
  const groups = {};
  for (const card of cards) {
    const sf = scryfallData?.get(card.name.toLowerCase());
    const group = getTypeGroup(sf?.type_line);
    if (!groups[group]) groups[group] = [];
    groups[group].push(card);
  }
  return groups;
}

function parseBasicLines(basicsStr) {
  if (!basicsStr || basicsStr === "None") return [];
  return basicsStr.split(",").flatMap((chunk) => {
    const m = chunk.trim().match(/^(\d+)x?\s+(.+)$/);
    return m ? [{ qty: parseInt(m[1], 10), name: m[2] }] : [];
  });
}

// Cardmarket wants list format: plain "qty name" lines, no headers, no commander section
function buildCardmarketList(commander, parsedCards, parsedBasics) {
  const lines = [];
  if (commander) lines.push(`1 ${commander}`);
  for (const { qty, name } of parsedCards) {
    lines.push(`${qty} ${name}`);
  }
  if (parsedBasics && parsedBasics !== "None") {
    for (const chunk of parsedBasics.split(",")) {
      const m = chunk.trim().match(/^(\d+)x?\s+(.+)$/);
      if (m) lines.push(`${m[1]} ${m[2]}`);
    }
  }
  return lines.join("\n");
}

function buildDecklist(commander, parsedCards, parsedBasics) {
  const lines = [];
  if (commander) {
    lines.push("Commander", `1 ${commander}`, "");
  }
  lines.push("Deck");
  for (const { qty, name } of parsedCards) {
    lines.push(`${qty} ${name}`);
  }
  if (parsedBasics && parsedBasics !== "None") {
    for (const chunk of parsedBasics.split(",")) {
      const m = chunk.trim().match(/^(\d+)x?\s+(.+)$/);
      if (m) lines.push(`${m[1]} ${m[2]}`);
    }
  }
  return lines.join("\n");
}

function DecklistSection({ section, scryfallData }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="accordion-section">
      <button className="accordion-header" onClick={() => setOpen((v) => !v)}>
        <span className="accordion-title">{section.title}</span>
        <span className="accordion-count">{section.count}</span>
        <span className={`accordion-chevron${open ? " open" : ""}`}>›</span>
      </button>
      {open && (
        <div className="accordion-body">
          {section.cards.map((card) => {
            const gbp = priceGbp(scryfallData?.get(card.name.toLowerCase()), card.qty);
            const priceLabel = gbp > 0 ? gbp.toFixed(2) : null;
            return (
              <div className="decklist-row" key={card.name}>
                <span className="decklist-qty">{card.qty}</span>
                <CardLink name={card.name} scryfallData={scryfallData} />
                {priceLabel && <span className="decklist-price">£{priceLabel}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isLandCard(typeLine) {
  if (!typeLine) return false;
  // For MDFCs (e.g. "Sorcery // Land"), only treat as a land if the FRONT face is a land.
  // This ensures spell/land MDFCs are counted in the CMC curve, not skipped as pure lands.
  const frontFace = typeLine.split("//")[0].trim();
  return frontFace.includes("Land");
}

const COLOURS = [
  { key: "W", label: "White",      css: "#e8d8a0", textCss: "#07071a" },
  { key: "U", label: "Blue",       css: "#7fb8d4", textCss: "#07071a" },
  { key: "B", label: "Black",      css: "#3a3a5c", textCss: "#c8c8e8" },
  { key: "R", label: "Red",        css: "#c87f7f", textCss: "#07071a" },
  { key: "G", label: "Green",      css: "#7fc87f", textCss: "#07071a" },
  { key: "C", label: "Colourless", css: "#7777aa", textCss: "#c8c8e8" },
];

const BASIC_PRODUCED = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

function ManaCurve({ parsedCards, parsedBasics, scryfallData, commander }) {
  // --- Commander colour identity ---
  const commanderSf = commander ? scryfallData?.get(commander.toLowerCase()) : null;
  const identitySet = new Set(commanderSf?.color_identity ?? []);
  const hasIdentity = identitySet.size > 0;

  // --- CMC buckets (non-lands) ---
  const buckets = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6+": 0 };
  let totalCmc = 0, nonLandCount = 0, landCount = 0;

  // --- Colour tallies ---
  const production = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const demand     = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

  // Parse generic/colourless mana pips from a mana cost string like "{3}{G}{G}"
  function countColourlessPips(manaCost) {
    if (!manaCost) return 0;
    let total = 0;
    for (const token of manaCost.matchAll(/\{([^}]+)\}/g)) {
      const t = token[1];
      if (/^\d+$/.test(t)) total += parseInt(t, 10); // generic numbers
      else if (t === "C") total += 1;                 // explicit colourless
      // skip X, W, U, B, R, G, hybrid, phyrexian, etc.
    }
    return total;
  }
  let manaArtifactCount = 0;
  let landRampCount = 0;

  // Helper: add production, filtering identity colours but always counting C
  function addProduction(producedMana, qty) {
    for (const c of producedMana) {
      if (c === "C") {
        production.C += qty;
      } else if (production[c] !== undefined && (!hasIdentity || identitySet.has(c))) {
        production[c] += qty;
      }
    }
  }

  for (const card of parsedCards) {
    const sf = scryfallData?.get(card.name.toLowerCase());
    const typeLine = sf?.type_line ?? "";

    if (isLandCard(typeLine)) {
      landCount += card.qty;
      addProduction(sf?.produced_mana ?? [], card.qty);
    } else {
      const cmc = sf?.cmc ?? null;
      if (cmc !== null) {
        totalCmc += cmc * card.qty;
        nonLandCount += card.qty;
        buckets[cmc >= 6 ? "6+" : String(Math.floor(cmc))] += card.qty;
      }
      for (const c of (sf?.colors ?? [])) {
        if (demand[c] !== undefined) demand[c] += card.qty;
      }
      // Colourless/generic demand from mana cost
      const colourlessPips = countColourlessPips(sf?.mana_cost ?? "");
      if (colourlessPips > 0) demand.C += colourlessPips * card.qty;
      // Non-land mana producers: mana rocks, dorks — Scryfall marks these directly
      const produced = sf?.produced_mana ?? [];
      if (produced.length > 0) {
        addProduction(produced, card.qty);
        manaArtifactCount += card.qty;
      }

      // Spell-based ramp: anything that accelerates mana beyond the land-per-turn rule
      // but isn't already counted via produced_mana above.
      if (produced.length === 0) {
        const oracle = (sf?.oracle_text ?? "").toLowerCase();

        const isLandRamp =
          // Puts a land onto the battlefield (Rampant Growth, Cultivate, etc.)
          (oracle.includes("search your library") && oracle.includes("land") && oracle.includes("battlefield")) ||
          // Extra land drop enablers (Exploration, Azusa, Oracle of Mul Daya)
          oracle.includes("play an additional land") ||
          oracle.includes("play two additional lands") ||
          // Puts land from hand/top onto battlefield (Burgeoning, etc.)
          (oracle.includes("put") && oracle.includes("land card") && oracle.includes("battlefield"));

        const isTreasureRamp =
          // Creates Treasure tokens (each sac'd for {1} mana)
          oracle.includes("treasure token");

        const isRitual =
          // One-shot mana burst (Dark Ritual, Cabal Ritual, Pyretic Ritual, etc.)
          // Match "add {X}" where X is a mana symbol — avoids false positives
          /add \{[wubrgc0-9]+\}/i.test(sf?.oracle_text ?? "") &&
          !typeLine.toLowerCase().includes("land");

        if (isLandRamp || isTreasureRamp || isRitual) {
          landRampCount += card.qty;
        }
      }
    }
  }

  // Include commander in demand
  if (commander) {
    for (const c of (commanderSf?.colors ?? [])) {
      if (demand[c] !== undefined) demand[c] += 1;
    }
    const cmdColourless = countColourlessPips(commanderSf?.mana_cost ?? "");
    if (cmdColourless > 0) demand.C += cmdColourless;
  }

  // Basic lands production (only if colour is in identity)
  for (const b of parseBasicLines(parsedBasics)) {
    landCount += b.qty;
    const c = BASIC_PRODUCED[b.name];
    if (c && production[c] !== undefined && (!hasIdentity || identitySet.has(c))) {
      production[c] += b.qty;
    }
  }

  const avgCmc = nonLandCount > 0 ? (totalCmc / nonLandCount).toFixed(2) : "—";
  const bucketKeys = ["0", "1", "2", "3", "4", "5", "6+"];
  const maxCount = Math.max(...bucketKeys.map(k => buckets[k] || 0), 1);

  const totalDemand = Object.values(demand).reduce((a, b) => a + b, 0);
  const totalManaSources = landCount + manaArtifactCount;
  // Identity colours + C if any colourless production or demand; fall back to all active if identity unknown
  const activeColours = hasIdentity
    ? COLOURS.filter(({ key }) => identitySet.has(key) || (key === "C" && (production.C > 0 || demand.C > 0)))
    : COLOURS.filter(({ key }) => production[key] > 0 || demand[key] > 0);
  const hasColourData = totalDemand > 0 || Object.values(production).some(v => v > 0);

  return (
    <div className="panel" style={{ marginBottom: "1.25rem" }}>
      <div className="panel-title" style={{ color: "var(--gold)", borderBottom: "1px solid rgba(200,169,110,0.2)", paddingBottom: "0.5rem" }}>
        Mana Analysis
      </div>

      {/* CMC bar chart */}
      <div className="mana-curve">
        {bucketKeys.map((key) => {
          const count = buckets[key] || 0;
          const heightPct = Math.round((count / maxCount) * 100);
          return (
            <div className="curve-col" key={key}>
              <div className="curve-bar-wrap">
                <span className="curve-count">{count > 0 ? count : ""}</span>
                <div className="curve-bar" style={{ height: `${heightPct}%` }} />
              </div>
              <span className="curve-label">{key}</span>
            </div>
          );
        })}
      </div>
      <div className="mana-stats">
        <span>Avg CMC: <strong>{avgCmc}</strong></span>
        <span>Lands: <strong>{landCount}</strong></span>
        {manaArtifactCount > 0 && (
          <span>Rocks/Dorks: <strong>{manaArtifactCount}</strong></span>
        )}
        {landRampCount > 0 && (
          <span>Spell Ramp: <strong>{landRampCount}</strong></span>
        )}
        {(manaArtifactCount + landRampCount) > 0 && (
          <span>Total Ramp: <strong>{manaArtifactCount + landRampCount}</strong></span>
        )}
      </div>

      {/* Colour balance */}
      <div className="colour-balance-title">Colour Balance</div>
      {!hasColourData ? (
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.25rem" }}>
          Re-run this analysis to see colour balance data.
        </p>
      ) : (
        <div className="colour-balance">
          {activeColours.map(({ key, label, css, textCss }) => {
            const prod = production[key] ?? 0;
            const dem  = demand[key] ?? 0;
            const prodPct = totalManaSources > 0 ? Math.round((prod / totalManaSources) * 100) : 0;
            const demPct  = totalDemand      > 0 ? Math.round((dem  / totalDemand)      * 100) : 0;
            return (
              <div className="colour-row" key={key}>
                <div className="colour-pip" style={{ background: css, color: textCss }} />
                <span className="colour-name">{label}</span>
                <div className="colour-bars">
                  <div className="colour-bar-row">
                    <span className="colour-bar-label">Production</span>
                    <div className="colour-bar-track">
                      <div className="colour-bar-fill" style={{ width: `${prodPct}%`, background: css }} />
                    </div>
                    <span className="colour-bar-stat">{prod} <span className="colour-pct">({prodPct}%)</span></span>
                  </div>
                  <div className="colour-bar-row">
                    <span className="colour-bar-label">Demand</span>
                    <div className="colour-bar-track">
                      <div className="colour-bar-fill" style={{ width: `${demPct}%`, background: css, opacity: 0.5 }} />
                    </div>
                    <span className="colour-bar-stat">{dem} <span className="colour-pct">({demPct}%)</span></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Results({ data, cardCount, scryfallData, commander, parsedCards, parsedBasics, totalPriceGbp, isGenerated, onReset }) {
  const [copied, setCopied] = useState(false);
  const [cardmarketCopied, setCardmarketCopied] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [shareStatus, setShareStatus] = useState("idle"); // idle | saving | copied | error
  const [extendedScryfallData, setExtendedScryfallData] = useState(scryfallData);
  const [combos, setCombos] = useState(null); // { included, almostIncluded } | null

  // Deterministic combo detection via Commander Spellbook (community-verified
  // data, as opposed to the AI-suggested lines below).
  useEffect(() => {
    if (!parsedCards?.length) return;
    const controller = new AbortController();
    fetch("/api/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commanders: commander ? [commander] : [],
        main: parsedCards.map((c) => c.name),
      }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json) setCombos(json); })
      .catch(() => {});
    return () => controller.abort();
  }, [commander, parsedCards]);

  async function handleShare() {
    setShareStatus("saving");
    try {
      const resp = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commander,
          data,
          scryfall_data: Array.from(extendedScryfallData?.entries() ?? []),
          parsed_cards: parsedCards,
          parsed_basics: parsedBasics,
          total_price_gbp: totalPriceGbp,
          is_generated: isGenerated,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error);
      const url = `${window.location.origin}${window.location.pathname}?share=${json.id}`;
      window.history.replaceState({}, "", `?share=${json.id}`);
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 3000);
    } catch {
      setShareStatus("error");
      setTimeout(() => setShareStatus("idle"), 3000);
    }
  }

  useEffect(() => {
    const suggestedNames = [
      ...(data.adds || []).map(a => a.card),
      ...(data.cuts || []).map(c => c.card),
    ].filter(name => name && !scryfallData?.has(name.toLowerCase()));

    if (!suggestedNames.length) {
      setExtendedScryfallData(scryfallData);
      return;
    }

    fetchScryfallData(suggestedNames).then(extra => {
      const merged = new Map(scryfallData);
      for (const [k, v] of extra) merged.set(k, v);
      setExtendedScryfallData(merged);
    });
  }, [data, scryfallData]);

  const commanderInfo = commander ? extendedScryfallData?.get(commander.toLowerCase()) : null;

  function handleExport() {
    const text = buildDecklist(commander, parsedCards ?? [], parsedBasics ?? "");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleBuyCardmarket() {
    const list = buildCardmarketList(commander, parsedCards ?? [], parsedBasics ?? "");
    navigator.clipboard.writeText(list).then(() => {
      setCardmarketCopied(true);
      setTimeout(() => setCardmarketCopied(false), 4000);
    });
    window.open("https://www.cardmarket.com/en/Magic/Wants", "_blank", "noopener,noreferrer");
  }
  const artUrl = commanderInfo?.art_crop_uri ?? commanderInfo?.image_uri ?? null;

  return (
    <div className="results-section">
      {/* Commander header card */}
      <div
        className="card commander-overview"
        style={artUrl ? {
          backgroundImage: `linear-gradient(to right, rgba(7,7,26,0.97) 40%, rgba(7,7,26,0.72) 70%, rgba(7,7,26,0.55) 100%), url(${artUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
        } : {}}
      >
        <div className="commander-header">
          <RatingRing rating={data.rating} />
          <div className="commander-meta">
            {commander && (
              <div className="commander-name-block">
                <span className="commander-label">Commander</span>
                <h2 className="commander-name">{commander}</h2>
              </div>
            )}
            {(() => {
              const ci = commanderInfo?.color_identity ?? [];
              if (!ci.length) return null;
              const sorted = [...ci].sort((a, b) => WUBRG_ORDER.indexOf(a) - WUBRG_ORDER.indexOf(b));
              return (
                <div className="colour-identity-row">
                  {sorted.map(c => <ManaSymbol key={c} colour={c} />)}
                  <span className="colour-identity-name">{getColourIdentityName(ci)}</span>
                </div>
              );
            })()}
            <div className="archetype-name">{data.archetype || "Unknown Archetype"}</div>
            <div className="tag-row">
              <span className="tag tag-gold">Bracket {data.bracket}</span>
              {totalPriceGbp != null && (
                <span className="tag tag-green">~£{totalPriceGbp.toFixed(2)}</span>
              )}
              <span className="tag tag-purple">Rating {data.rating}/10</span>
            </div>
            <p className="summary-text">{data.summary}</p>
          </div>
        </div>
      </div>

      {/* Strengths / Weaknesses */}
      <div className="two-col">
        <div className="panel panel-green">
          <div className="panel-title">Strengths</div>
          <ul>
            {(data.strengths || []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="panel panel-red">
          <div className="panel-title">Weaknesses</div>
          <ul>
            {(data.weaknesses || []).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Cuts — only for non-generated decks */}
      {!isGenerated && (
        <div className="panel panel-red" style={{ marginBottom: "1.25rem" }}>
          <div className="panel-title">Suggested Cuts</div>
          {(data.cuts || []).map((c, i) => (
            <div className="card-row" key={i}>
              <span className="card-prefix card-prefix-red">−</span>
              <div className="card-row-content">
                <CardLink name={c.card} scryfallData={extendedScryfallData} />
                <span className="card-reason">— {c.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Additions */}
      <div className="panel panel-green" style={{ marginBottom: "1.25rem" }}>
        <div className="panel-title">
          {isGenerated ? "Power Level Upgrades" : "Suggested Additions"}
        </div>
        {(data.adds || []).map((a, i) => (
          <div className="card-row" key={i}>
            <span className="card-prefix card-prefix-green">+</span>
            <div className="card-row-content">
              <CardLink name={a.card} scryfallData={extendedScryfallData} />
              <span className="card-reason">— {a.reason}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Detected Combos — verified against Commander Spellbook */}
      {(combos?.included?.length > 0 || combos?.almostIncluded?.length > 0) && (
        <div className="panel panel-purple" style={{ marginBottom: "1.25rem" }}>
          <div className="panel-title">
            Detected Combos{" "}
            <span style={{ color: "var(--muted)", fontSize: "0.72rem", fontFamily: "inherit", letterSpacing: 0 }}>
              — verified via Commander Spellbook
            </span>
          </div>
          {(combos.included ?? []).map((combo, i) => (
            <div className="card-row" key={`inc-${i}`}>
              <span className="card-prefix" style={{ color: "var(--purple)" }}>✦</span>
              <div className="card-row-content">
                {combo.cards.map((name, j) => (
                  <span key={name}>
                    {j > 0 && <span style={{ color: "var(--muted)", margin: "0 0.35rem" }}>+</span>}
                    <CardLink name={name} scryfallData={extendedScryfallData} />
                  </span>
                ))}
                {combo.produces?.length > 0 && (
                  <span className="card-reason"> — produces: {combo.produces.join(", ")}</span>
                )}
                {combo.url && (
                  <a href={combo.url} target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--purple)" }}>
                    details ↗
                  </a>
                )}
              </div>
            </div>
          ))}
          {combos.almostIncluded?.length > 0 && (
            <>
              <div style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0.75rem 0 0.35rem" }}>
                One card away:
              </div>
              {combos.almostIncluded.map((combo, i) => (
                <div className="card-row" key={`alm-${i}`}>
                  <span className="card-prefix" style={{ color: "var(--muted)" }}>◇</span>
                  <div className="card-row-content">
                    {combo.cards.map((name, j) => (
                      <span key={name}>
                        {j > 0 && <span style={{ color: "var(--muted)", margin: "0 0.35rem" }}>+</span>}
                        <CardLink name={name} scryfallData={extendedScryfallData} />
                      </span>
                    ))}
                    {combo.produces?.length > 0 && (
                      <span className="card-reason"> — would produce: {combo.produces.join(", ")}</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Combo Lines + Budget */}
      <div className="two-col">
        <div className="panel panel-purple">
          <div className="panel-title">AI-Suggested Lines</div>
          <ul>
            {(data.combo_lines || []).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="panel panel-blue">
          <div className="panel-title">Price Profile</div>
          <p style={{ fontSize: "0.95rem", color: "var(--text)" }}>{data.budget_note}</p>
        </div>
      </div>

      {/* Upgrade Path */}
      {data.upgrade_path?.length > 0 && (
        <div className="panel panel-gold" style={{ marginBottom: "1.25rem" }}>
          <div className="panel-title" style={{ color: "var(--gold)", borderBottom: "1px solid rgba(200,169,110,0.2)", paddingBottom: "0.5rem" }}>
            Upgrade Path
          </div>
          {data.upgrade_path.map((u, i) => (
            <div className="card-row" key={i}>
              <span className="card-prefix" style={{ color: "var(--gold)", width: "auto", marginRight: "0.25rem" }}>
                {i + 1}.
              </span>
              <div className="card-row-content">
                <span style={{ color: "var(--text)", fontSize: "0.95rem" }}>{u.action}</span>
                {u.impact && <span className="tag tag-gold" style={{ marginLeft: "0.5rem", fontSize: "0.7rem", verticalAlign: "middle" }}>{u.impact}</span>}
                <div className="card-reason" style={{ marginLeft: 0, display: "block", marginTop: "0.1rem" }}>— {u.reason}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Budget Swaps */}
      {data.budget_swaps?.length > 0 && (
        <div className="panel panel-blue" style={{ marginBottom: "1.25rem" }}>
          <div className="panel-title">Budget Swaps</div>
          {data.budget_swaps.map((s, i) => (
            <div className="card-row" key={i}>
              <div className="card-row-content">
                <CardLink name={s.out} scryfallData={extendedScryfallData} />
                <span style={{ color: "var(--muted)", margin: "0 0.4rem" }}>→</span>
                <CardLink name={s.in} scryfallData={extendedScryfallData} />
                <span className="card-reason"> — {s.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Missing Staples */}
      {data.missing_staples?.length > 0 && (
        <div className="panel" style={{ marginBottom: "1.25rem", borderColor: "rgba(160,127,212,0.3)" }}>
          <div className="panel-title" style={{ color: "var(--purple)", borderBottom: "1px solid rgba(160,127,212,0.2)", paddingBottom: "0.5rem" }}>
            Missing Staples <span style={{ color: "var(--muted)", fontSize: "0.72rem", fontFamily: "inherit", letterSpacing: 0 }}>— popular with this commander on EDHREC</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.25rem" }}>
            {data.missing_staples.map((name) => (
              <a key={name} href={scryfallLink(name)} target="_blank" rel="noopener noreferrer"
                className="tag tag-purple" style={{ textDecoration: "none", fontSize: "0.8rem", fontFamily: "inherit" }}>
                {name}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Decklist */}
      {parsedCards?.length > 0 && (() => {
        const groups = groupCardsByType(parsedCards, extendedScryfallData);
        const basics = parseBasicLines(parsedBasics);

        const sections = [];
        if (commander) {
          sections.push({ title: "Commander", count: 1, cards: [{ qty: 1, name: commander }] });
        }
        TYPE_ORDER.forEach((type) => {
          const cards = groups[type];
          if (cards?.length) {
            sections.push({ title: `${type}s`, count: cards.reduce((s, c) => s + c.qty, 0), cards });
          }
        });
        if (basics.length) {
          sections.push({ title: "Basic Lands", count: basics.reduce((s, c) => s + c.qty, 0), cards: basics });
        }

        return (
          <div className="panel" style={{ marginBottom: "1.25rem" }}>
            <div className="panel-title" style={{ color: "var(--gold)", borderBottom: "1px solid rgba(200,169,110,0.2)", paddingBottom: "0.5rem" }}>
              Full Decklist
            </div>
            {sections.map((section) => (
              <DecklistSection key={section.title} section={section} scryfallData={extendedScryfallData} />
            ))}
          </div>
        );
      })()}

      {/* Mana Analysis */}
      {parsedCards?.length > 0 && (
        <ManaCurve
          parsedCards={parsedCards}
          parsedBasics={parsedBasics}
          scryfallData={extendedScryfallData}
          commander={commander}
        />
      )}

      {/* Interaction Breakdown */}
      {parsedCards?.length > 0 && (() => {
        const ix = analyzeInteractions(parsedCards, extendedScryfallData);
        const cats = [
          { label: "Removal",         value: ix.removal,       thresholds: [3, 6]  },
          { label: "Board Wipes",     value: ix.boardWipes,    thresholds: [1, 3]  },
          { label: "Counterspells",   value: ix.counterspells, thresholds: [2, 5]  },
          { label: "Card Draw",       value: ix.draw,          thresholds: [5, 10] },
          { label: "Graveyard Hate",  value: ix.graveyardHate, thresholds: [1, 3]  },
          { label: "Protection",      value: ix.protection,    thresholds: [2, 4]  },
        ];
        return (
          <div className="panel" style={{ marginBottom: "1.25rem" }}>
            <div className="panel-title" style={{ color: "var(--gold)", borderBottom: "1px solid rgba(200,169,110,0.2)", paddingBottom: "0.5rem" }}>
              Interaction Breakdown
            </div>
            <div className="interaction-grid">
              {cats.map(({ label, value, thresholds }) => {
                const { label: rLabel, color } = interactionRating(value, thresholds);
                return (
                  <div className="interaction-row" key={label}>
                    <span className="interaction-label">{label}</span>
                    <span className="interaction-count">{value}</span>
                    <span className="interaction-badge" style={{ color, borderColor: color }}>{rLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="no-print" style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {parsedCards?.length > 0 && (
            <button className="btn btn-secondary" onClick={handleExport}>
              {copied ? "Copied!" : "Copy Decklist"}
            </button>
          )}
          {parsedCards?.length > 0 && (
            <button className="btn btn-cardmarket" onClick={handleBuyCardmarket}>
              🛒 Buy on Cardmarket
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleShare} disabled={shareStatus === "saving"}>
            {shareStatus === "saving" ? "Saving…" : shareStatus === "copied" ? "Link Copied!" : shareStatus === "error" ? "Share Failed" : "Share Analysis"}
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            Save as PDF
          </button>
          <button className="btn btn-secondary" onClick={() => setShowFeedback(true)}>
            Leave Feedback
          </button>
          <button className="btn btn-secondary" onClick={onReset}>
            ← Return to the Forge
          </button>
        </div>
        {cardmarketCopied && (
          <p className="cardmarket-hint">
            Decklist copied! On Cardmarket: <strong>Wants → Create List → Import</strong> and paste.
          </p>
        )}
      </div>

      {showFeedback && (
        <FeedbackModal
          commander={commander}
          archetype={data.archetype}
          rating={data.rating}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}
