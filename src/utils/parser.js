const BASIC_LAND_NAMES = new Set([
  "Plains", "Island", "Swamp", "Mountain", "Forest",
  "Wastes", "Snow-Covered Plains", "Snow-Covered Island",
  "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest",
  "Snow-Covered Wastes",
]);

const SKIP_SECTIONS = new Set(["sideboard", "maybeboard"]);
const SECTION_HEADERS = new Set(["commander", "deck", "mainboard", "sideboard", "maybeboard"]);

function cleanLine(line) {
  // Strip comments
  line = line.replace(/#.*$/, "").trim();
  // Strip set codes and collector numbers: (SET) 123 or (SET)
  line = line.replace(/\([A-Z0-9]{2,6}\)\s*\d*/gi, "").trim();
  // Strip foil/promo markers: *F*, *E*, *p, bare *, Unicode stars ★☆
  line = line.replace(/\s*[\*★☆]+[a-zA-Z]?[\*★☆]*/g, "").trim();
  // Strip standalone trailing single-char variant markers: f/F (foil) or p/P (promo)
  line = line.replace(/\s+[fpFP]$/, "").trim();
  // Normalise MDFC separator: " / " → " // " so Scryfall lookups work
  line = line.replace(/\s+\/\s+(?!\/)/g, " // ").trim();
  return line;
}

function parseLine(line) {
  // Match: optional qty (number or numberx), then card name
  const match = line.match(/^(\d+)[xX]?\s+(.+)$/);
  if (!match) return null;
  const qty = parseInt(match[1], 10);
  const name = match[2].trim();
  if (!name || qty < 1) return null;
  return { qty, name };
}

export function parseDeckList(raw) {
  const lines = raw.split(/\r?\n/);
  const log = [];

  // Determine format: sectioned or headerless
  const hasSectionHeader = lines.some((l) => {
    const trimmed = l.trim().toLowerCase().replace(/:$/, "");
    return SECTION_HEADERS.has(trimmed);
  });

  const cardMap = new Map(); // name -> qty
  const basicsMap = new Map(); // name -> qty
  let commander = null;

  if (hasSectionHeader) {
    log.push("Detected sectioned format");
    let currentSection = "deck";
    let commanderSection = false;

    for (const raw_line of lines) {
      const trimmed = raw_line.trim();
      if (!trimmed) continue;

      const sectionKey = trimmed.toLowerCase().replace(/:$/, "");
      if (SECTION_HEADERS.has(sectionKey)) {
        currentSection = sectionKey;
        commanderSection = sectionKey === "commander";
        log.push(`Section: ${sectionKey}`);
        continue;
      }

      if (SKIP_SECTIONS.has(currentSection)) continue;

      const cleaned = cleanLine(trimmed);
      if (!cleaned) continue;

      const parsed = parseLine(cleaned);
      if (!parsed) continue;

      if (commanderSection) {
        commander = parsed.name;
        commanderSection = false; // only take first card in commander section
        log.push(`Commander: ${parsed.name}`);
        continue;
      }

      if (BASIC_LAND_NAMES.has(parsed.name)) {
        basicsMap.set(parsed.name, (basicsMap.get(parsed.name) || 0) + parsed.qty);
      } else {
        cardMap.set(parsed.name, (cardMap.get(parsed.name) || 0) + parsed.qty);
      }
    }
  } else {
    log.push("Detected headerless (Moxfield) format");
    let firstCardUsed = false;

    for (const raw_line of lines) {
      const trimmed = raw_line.trim();
      if (!trimmed) continue;

      const cleaned = cleanLine(trimmed);
      if (!cleaned) continue;

      const parsed = parseLine(cleaned);
      if (!parsed) continue;

      if (!firstCardUsed && parsed.qty === 1 && !BASIC_LAND_NAMES.has(parsed.name)) {
        commander = parsed.name;
        firstCardUsed = true;
        log.push(`Commander (first card): ${parsed.name}`);
        continue;
      }

      if (BASIC_LAND_NAMES.has(parsed.name)) {
        basicsMap.set(parsed.name, (basicsMap.get(parsed.name) || 0) + parsed.qty);
      } else {
        cardMap.set(parsed.name, (cardMap.get(parsed.name) || 0) + parsed.qty);
      }
    }
  }

  // Remove commander from non-basic cards if duplicated
  if (commander) {
    cardMap.delete(commander);
  }

  const cards = Array.from(cardMap.entries()).map(([name, qty]) => ({ qty, name }));

  const basicsStr = Array.from(basicsMap.entries())
    .map(([name, qty]) => `${qty}x ${name}`)
    .join(", ") || "None";

  log.push(`Parsed ${cards.length} non-basic cards, basics: ${basicsStr}`);

  return { commander, cards, basics: basicsStr, log };
}
