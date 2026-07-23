import { useState, useRef, useEffect } from "react";
import DeckInput from "./components/DeckInput.jsx";
import CollectionInput from "./components/CollectionInput.jsx";
import CollectionSuggestions from "./components/CollectionSuggestions.jsx";
import Results from "./components/Results.jsx";
import DiagnosticLog from "./components/DiagnosticLog.jsx";
import AuthModal from "./components/AuthModal.jsx";
import { parseDeckList } from "./utils/parser.js";
import { parseCollectionList, findCommanderCandidates } from "./utils/collection.js";
import { fetchScryfallData } from "./utils/scryfall.js";
import { supabase } from "./utils/supabase.js";
import { priceGbp } from "./utils/price.js";

async function loadSupabaseAnalyses() {
  const { data } = await supabase
    .from('analyses')
    .select('*')
    .order('saved_at', { ascending: false })
    .limit(20);
  return (data || []).map(row => ({
    id: row.id,
    commander: row.commander,
    archetype: row.archetype,
    rating: row.rating,
    cardCount: row.card_count,
    data: row.data,
    scryfallData: row.scryfall_data || [],
    parsedCards: row.parsed_cards || [],
    parsedBasics: row.parsed_basics || '',
    isGenerated: row.is_generated || false,
    totalPriceGbp: row.total_price_gbp || null,
    savedAt: row.saved_at,
  }));
}

function AnvilIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="anvil-icon"
    >
      {/* Top face + horn */}
      <path d="M2,25 L14,18 L44,18 L44,31 L14,31 Z" fill="#c8a96e" />
      {/* Neck */}
      <rect x="20" y="31" width="15" height="5" fill="#a07848" />
      {/* Base */}
      <rect x="13" y="36" width="29" height="8" rx="2" fill="#a07848" />
    </svg>
  );
}

const BRACKETS = [
  { n: "1", label: "Exhibition", desc: "Theme & creativity, no combos" },
  { n: "2", label: "Core",       desc: "Synergy-focused, telegraphed wins" },
  { n: "3", label: "Upgraded",   desc: "Strong synergies, fast wins" },
  { n: "4", label: "Optimised",  desc: "Lethal & consistent" },
  { n: "5", label: "cEDH",       desc: "Competitive metagame" },
];

const STEP_LABELS = {
  generating: "Firing up the forge…",
  parsing: "Reading the scroll…",
  fetching_scryfall: "Scouring the vaults…",
  analysing: "Consulting the Smith…",
  suggesting: "Sifting through your collection…",
};

const PHASE_PROGRESS = {
  generating: 18,
  parsing: 34,
  fetching_scryfall: 60,
  analysing: 84,
  suggesting: 75,
};

export default function App() {
  const [phase, setPhase] = useState("idle");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [scryfallData, setScryfallData] = useState(null);
  const [cardCount, setCardCount] = useState(0);
  const [commander, setCommander] = useState(null);
  const [parsedCards, setParsedCards] = useState([]);
  const [parsedBasics, setParsedBasics] = useState("");
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  const [totalPriceGbp, setTotalPriceGbp] = useState(null);
  const [isGenerated, setIsGenerated] = useState(false);
  const [generateCommander, setGenerateCommander] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const [collectionNames, setCollectionNames] = useState([]);
  const [collectionSf, setCollectionSf] = useState(null);
  const [forging, setForging] = useState(false);

  // Auth state
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const logRef = useRef([]);

  // Load shared analysis from URL param on mount
  useEffect(() => {
    const shareId = new URLSearchParams(window.location.search).get("share");
    if (!shareId) return;
    fetch(`/api/share?id=${shareId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((row) => {
        if (!row) return;
        setResults(row.data);
        setCommander(row.commander);
        setScryfallData(new Map(row.scryfall_data ?? []));
        setParsedCards(row.parsed_cards ?? []);
        setParsedBasics(row.parsed_basics ?? "");
        setTotalPriceGbp(row.total_price_gbp ?? null);
        setIsGenerated(row.is_generated ?? false);
        setCardCount((row.parsed_cards?.length ?? 0) + 1);
        setPhase("done");
      })
      .catch(() => {});
  }, []);

  // Auth init effect
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load analyses when user/authLoading changes
  useEffect(() => {
    if (authLoading) return;
    if (user && supabase) {
      loadSupabaseAnalyses().then(setSavedAnalyses);
    } else {
      setSavedAnalyses([]);
    }
  }, [user, authLoading]);

  function addLog(msg) {
    logRef.current = [...logRef.current, `[${new Date().toLocaleTimeString()}] ${msg}`];
    setLogs([...logRef.current]);
  }

  async function handleAnalyse(rawText, { generated = false } = {}) {
    setIsGenerated(generated);
    logRef.current = [];
    setLogs([]);
    setError(null);
    setResults(null);

    // --- Parse ---
    setPhase("parsing");
    addLog("Parsing decklist…");
    let parsed;
    try {
      parsed = parseDeckList(rawText);
      for (const l of parsed.log) addLog(l);
      if (!parsed.commander) throw new Error("Could not identify a commander. Check your decklist format.");
      setCommander(parsed.commander);
      setParsedCards(parsed.cards);
      setParsedBasics(parsed.basics);
      addLog(`Commander: ${parsed.commander}`);
      addLog(`Non-basic cards: ${parsed.cards.length}`);
    } catch (e) {
      setError(e.message);
      setPhase("error");
      return;
    }

    const totalCards = parsed.cards.reduce((sum, c) => sum + c.qty, 0) + 1;
    setCardCount(totalCards);

    // --- Scryfall ---
    setPhase("fetching_scryfall");
    addLog("Fetching Scryfall data…");
    const allNames = [parsed.commander, ...parsed.cards.map((c) => c.name)];
    let sfMap;
    try {
      sfMap = await fetchScryfallData(allNames);
      addLog(`Scryfall returned data for ${sfMap.size} cards`);
      setScryfallData(sfMap);
    } catch (e) {
      addLog(`Scryfall fetch error: ${e.message} — continuing without card data`);
      sfMap = new Map();
      setScryfallData(sfMap);
    }

    // Compute GBP price (Cardmarket EUR preferred, TCGplayer USD fallback)
    const totalGbp = [{ name: parsed.commander, qty: 1 }, ...parsed.cards]
      .reduce((sum, c) => sum + priceGbp(sfMap.get(c.name.toLowerCase()), c.qty), 0);
    const computedPriceGbp = Math.round(totalGbp * 100) / 100;
    setTotalPriceGbp(computedPriceGbp);

    // Enrich cards with type, cmc, and full oracle text from Scryfall.
    const enrichedCards = parsed.cards.map((card) => {
      const sf = sfMap.get(card.name.toLowerCase());
      return {
        qty: card.qty,
        name: card.name,
        type: sf?.type_line ?? "Unknown",
        cmc: sf?.cmc ?? null,
        oracle: sf?.oracle_text || undefined,
      };
    });

    // --- Analyse ---
    setPhase("analysing");
    addLog("Sending to Claude for analysis…");

    try {
      const commanderSf = sfMap.get(parsed.commander.toLowerCase());

      // Identify expensive cards (>£12) so Claude can suggest budget alternatives
      const expensiveCards = [{ name: parsed.commander, qty: 1 }, ...parsed.cards]
        .map((c) => ({ name: c.name, price: priceGbp(sfMap.get(c.name.toLowerCase())) }))
        .filter((c) => c.price >= 12)
        .sort((a, b) => b.price - a.price)
        .slice(0, 8)
        .map((c) => ({ name: c.name, price: c.price.toFixed(2) }));

      const resp = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commander: parsed.commander,
          commanderData: commanderSf ? {
            mana_cost: commanderSf.mana_cost,
            type_line: commanderSf.type_line,
            oracle_text: commanderSf.oracle_text,
            color_identity: commanderSf.color_identity,
          } : null,
          cards: enrichedCards,
          basics: parsed.basics,
          expensiveCards,
        }),
      });

      const json = await resp.json();

      if (!resp.ok || json.error) {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }

      addLog("Analysis complete.");
      setResults(json);
      setPhase("done");

      // Build entry
      const entry = {
        id: Date.now(),
        commander: parsed.commander,
        archetype: json.archetype,
        rating: json.rating,
        data: json,
        cardCount: totalCards,
        scryfallData: Array.from(sfMap.entries()),
        parsedCards: parsed.cards,
        parsedBasics: parsed.basics,
        isGenerated: generated,
        totalPriceGbp: computedPriceGbp,
        savedAt: new Date().toISOString(),
      };

      if (user && supabase) {
        await supabase.from('analyses').insert({
          user_id: user.id,
          commander: entry.commander,
          archetype: entry.archetype,
          rating: entry.rating,
          card_count: entry.cardCount,
          data: entry.data,
          scryfall_data: entry.scryfallData,
          parsed_cards: entry.parsedCards,
          parsed_basics: entry.parsedBasics,
          is_generated: entry.isGenerated,
          total_price_gbp: entry.totalPriceGbp,
          saved_at: entry.savedAt,
        });
        loadSupabaseAnalyses().then(setSavedAnalyses);
      }
    } catch (e) {
      addLog(`Analysis error: ${e.message}`);
      setError(e.message);
      setPhase("error");
    }
  }

  function handleLoadSaved(entry) {
    setResults(entry.data);
    setCardCount(entry.cardCount);
    setCommander(entry.commander);
    setScryfallData(new Map(entry.scryfallData));
    setParsedCards(entry.parsedCards ?? []);
    setParsedBasics(entry.parsedBasics ?? "");
    setIsGenerated(entry.isGenerated ?? false);
    setTotalPriceGbp(entry.totalPriceGbp ?? null);
    setPhase("done");
  }

  async function handleDeleteSaved(id) {
    if (user && supabase) {
      await supabase.from('analyses').delete().eq('id', id);
      loadSupabaseAnalyses().then(setSavedAnalyses);
    }
  }

  async function handleGenerate(bracket) {
    logRef.current = [];
    setLogs([]);
    setError(null);
    setResults(null);
    setPhase("generating");

    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bracket,
          commander: generateCommander.trim() || undefined,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error || `HTTP ${resp.status}`);
      await handleAnalyse(json.decklist, { generated: true });
      // Surface what the server-side Scryfall validation changed
      const v = json.validation;
      if (v) {
        for (const r of v.removed ?? []) addLog(`Validator removed ${r.card} (${r.reason})`);
        if (v.addedBasics > 0) addLog(`Validator added ${v.addedBasics} basic land(s) to reach 99`);
        if (v.trimmed > 0) addLog(`Validator trimmed ${v.trimmed} card(s) down to 99`);
        for (const n of v.notes ?? []) addLog(`Validator: ${n}`);
      }
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  }

  async function handleSuggestFromCollection(rawText) {
    logRef.current = [];
    setLogs([]);
    setError(null);
    setResults(null);
    setSuggestions(null);

    setPhase("parsing");
    addLog("Parsing collection…");
    const { cards, totalCards } = parseCollectionList(rawText);
    addLog(`Parsed ${cards.length} distinct non-basic cards (${totalCards} total)`);
    if (cards.length < 20) {
      setError("Paste at least ~20 distinct cards so there's something to work with.");
      setPhase("error");
      return;
    }

    setPhase("fetching_scryfall");
    addLog("Fetching Scryfall data…");
    let sfMap;
    try {
      sfMap = await fetchScryfallData(cards.map((c) => c.name));
      addLog(`Scryfall returned data for ${sfMap.size} cards`);
    } catch (e) {
      setError(`Scryfall fetch failed: ${e.message}`);
      setPhase("error");
      return;
    }

    // Deterministic: find and score commander candidates locally
    const candidates = findCommanderCandidates(cards, sfMap);
    addLog(`Found ${candidates.length} possible commander(s) in collection`);
    if (!candidates.length) {
      setError("No legal commanders found — the collection needs at least one legendary creature.");
      setPhase("error");
      return;
    }
    for (const c of candidates.slice(0, 5)) {
      addLog(`Candidate: ${c.name} [${c.identity.join("") || "C"}] — ${c.supportCount} cards fit`);
    }

    setPhase("suggesting");
    addLog("Asking the Smith for deck concepts…");
    try {
      const names = cards.map((c) => c.name);
      const resp = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: candidates.slice(0, 15),
          collection: names.slice(0, 700),
        }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error || `HTTP ${resp.status}`);
      setSuggestions(json.suggestions);
      setCollectionNames(names);
      setCollectionSf(sfMap);
      setPhase("suggested");
      addLog(`Received ${json.suggestions.length} deck concept(s).`);
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  }

  async function handleForgeFromCollection(concept) {
    setForging(true);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bracket: ["1", "2", "3", "4", "5"].includes(String(concept.bracket)) ? String(concept.bracket) : "2",
          commander: concept.commander,
          collection: collectionNames.slice(0, 800),
        }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error || `HTTP ${resp.status}`);
      await handleAnalyse(json.decklist, { generated: true });
      const v = json.validation;
      if (v) {
        for (const r of v.removed ?? []) addLog(`Validator removed ${r.card} (${r.reason})`);
        if (v.addedBasics > 0) addLog(`Validator added ${v.addedBasics} basic land(s) to reach 99`);
        if (v.trimmed > 0) addLog(`Validator trimmed ${v.trimmed} card(s) down to 99`);
      }
    } catch (e) {
      setError(e.message);
      setPhase("error");
    } finally {
      setForging(false);
    }
  }

  async function handleSignOut() {
    await supabase?.auth.signOut();
    setUser(null);
    setSavedAnalyses([]);
  }

  function handleReset() {
    setPhase("idle");
    setResults(null);
    setError(null);
    setLogs([]);
    setCommander(null);
    setParsedCards([]);
    setParsedBasics("");
    setTotalPriceGbp(null);
    setIsGenerated(false);
    setSuggestions(null);
    setForging(false);
  }

  const isLoading = ["generating", "parsing", "fetching_scryfall", "analysing", "suggesting"].includes(phase);

  return (
    <div className="app-wrapper">
      <header className="site-header">
        <div className="logo-lockup">
          <AnvilIcon />
          <h1>DeckForge</h1>
        </div>
        <p>Your Commander deck, forged by the Smith</p>
        <div className="auth-area">
          {user ? (
            <>
              <span className="auth-email">{user.user_metadata?.username ?? user.email}</span>
              <button className="btn btn-secondary auth-btn" onClick={handleSignOut}>Sign Out</button>
            </>
          ) : (
            <button className="btn btn-secondary auth-btn" onClick={() => setShowAuth(true)}>Sign In</button>
          )}
        </div>
      </header>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} />
      )}

      {phase === "idle" && (
        <>
          <DeckInput onAnalyse={handleAnalyse} disabled={false} />

          <div className="card generate-section">
            <div className="generate-heading">Forge a Random Deck</div>
            <p className="generate-subtext">
              Choose your bracket and let the Smith forge and analyse a deck for you.
              Name a commander to build around, or leave blank for a surprise.
            </p>
            <input
              type="text"
              className="commander-input"
              placeholder="Commander (optional) — e.g. Meren of Clan Nel Toth"
              value={generateCommander}
              onChange={(e) => setGenerateCommander(e.target.value)}
              maxLength={120}
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "0.6rem 0.8rem",
                color: "var(--text)",
                fontSize: "0.92rem",
                fontFamily: "inherit",
                marginBottom: "0.9rem",
              }}
            />
            <div className="bracket-buttons">
              {BRACKETS.map(({ n, label, desc }) => (
                <button key={n} className="bracket-btn" onClick={() => handleGenerate(n)}>
                  <span className="bracket-num">{n}</span>
                  <span className="bracket-label">{label}</span>
                  <span className="bracket-desc">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <CollectionInput onSuggest={handleSuggestFromCollection} disabled={false} />

          {!user && !authLoading && (
            <div className="saved-section" style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.88rem", padding: "0.5rem 0" }}>
              <button className="btn btn-secondary" style={{ marginTop: "0.25rem" }} onClick={() => setShowAuth(true)}>
                Sign in to save your analyses
              </button>
            </div>
          )}

          {savedAnalyses.length > 0 && (
            <div className="saved-section">
              <div className="saved-heading">Saved Analyses</div>
              <div className="saved-list">
                {savedAnalyses.map((entry) => (
                  <div
                    key={entry.id}
                    className="saved-entry"
                    onClick={() => handleLoadSaved(entry)}
                  >
                    <div className="saved-entry-info">
                      <span className="saved-commander">{entry.commander}</span>
                      <span className="saved-archetype">{entry.archetype}</span>
                    </div>
                    <div className="saved-entry-meta">
                      <span className="tag tag-gold">Rating {entry.rating}/10</span>
                      <span className="saved-date">
                        {new Date(entry.savedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      className="saved-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSaved(entry.id);
                      }}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {isLoading && (
        <div className="card loading-wrap">
          <div className="spinner" />
          <div className="step-label">{STEP_LABELS[phase] || "Working…"}</div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${PHASE_PROGRESS[phase] || 10}%` }}
            />
          </div>
        </div>
      )}

      {phase === "error" && (
        <>
          <div className="error-box">
            <h3>Something went wrong</h3>
            <p style={{ color: "var(--text)", marginBottom: "1rem" }}>{error}</p>
            <button className="btn btn-secondary" onClick={handleReset}>
              ← Try Again
            </button>
          </div>
          <DiagnosticLog logs={logs} />
        </>
      )}

      {phase === "suggested" && suggestions && (
        <CollectionSuggestions
          suggestions={suggestions}
          collectionSize={collectionNames.length}
          scryfallData={collectionSf}
          onForge={handleForgeFromCollection}
          onBack={handleReset}
          forging={forging}
        />
      )}

      {phase === "done" && results && (
        <Results
          data={results}
          cardCount={cardCount}
          scryfallData={scryfallData}
          commander={commander}
          parsedCards={parsedCards}
          parsedBasics={parsedBasics}
          totalPriceGbp={totalPriceGbp}
          isGenerated={isGenerated}
          onReset={handleReset}
        />
      )}

      <footer className="site-footer">
        DeckForge — Powered by Scryfall &amp; Claude AI. Not affiliated with Wizards of the Coast.
      </footer>
    </div>
  );
}
