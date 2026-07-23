import { useEffect, useRef, useState } from "react";

const IDENTITY_SORT = ["W", "U", "B", "R", "G"];

function ManaSymbol({ colour }) {
  return (
    <img
      src={`https://svgs.scryfall.io/card-symbols/${colour}.svg`}
      alt={colour}
      className="mana-symbol"
    />
  );
}

function CommanderName({ name, scryfallData }) {
  const imgRef = useRef(null);
  const info = scryfallData?.get(name.toLowerCase());
  const imgUrl = info?.image_uri ?? null;

  function handleMouseMove(e) {
    if (!imgRef.current) return;
    imgRef.current.style.display = "block";
    imgRef.current.style.left = `${e.clientX + 16}px`;
    imgRef.current.style.top = `${Math.max(10, e.clientY - 100)}px`;
  }
  function handleMouseLeave() {
    if (imgRef.current) imgRef.current.style.display = "none";
  }

  return (
    <span
      style={{ fontFamily: "Cinzel, serif", fontSize: "1.15rem", color: "var(--gold)", cursor: "default" }}
      onMouseMove={imgUrl ? handleMouseMove : undefined}
      onMouseLeave={imgUrl ? handleMouseLeave : undefined}
    >
      {name}
      {imgUrl && (
        <img
          ref={imgRef}
          src={imgUrl}
          alt={name}
          className="card-preview-img"
          style={{ display: "none", position: "fixed", width: 220, borderRadius: 10, zIndex: 50 }}
        />
      )}
    </span>
  );
}

function CardChip({ name, scryfallData, muted }) {
  const imgRef = useRef(null);
  const info = scryfallData?.get(name.toLowerCase());
  const imgUrl = info?.image_uri ?? null;

  function handleMouseMove(e) {
    if (!imgRef.current) return;
    imgRef.current.style.display = "block";
    imgRef.current.style.left = `${e.clientX + 16}px`;
    imgRef.current.style.top = `${Math.max(10, e.clientY - 100)}px`;
  }
  function handleMouseLeave() {
    if (imgRef.current) imgRef.current.style.display = "none";
  }

  return (
    <span
      className={muted ? "tag" : "tag tag-purple"}
      style={{ fontSize: "0.78rem", fontFamily: "inherit", cursor: "default", opacity: muted ? 0.75 : 1 }}
      onMouseMove={imgUrl ? handleMouseMove : undefined}
      onMouseLeave={imgUrl ? handleMouseLeave : undefined}
    >
      {name}
      {imgUrl && (
        <img
          ref={imgRef}
          src={imgUrl}
          alt={name}
          className="card-preview-img"
          style={{ display: "none", position: "fixed", width: 200, borderRadius: 10, zIndex: 50 }}
        />
      )}
    </span>
  );
}

export default function CollectionSuggestions({ suggestions, collectionSize, scryfallData, onForge, onBack, forging }) {
  const [chosen, setChosen] = useState(null);

  useEffect(() => { if (!forging) setChosen(null); }, [forging]);

  return (
    <div className="results-section">
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div className="generate-heading">Decks Hiding in Your Collection</div>
        <p className="generate-subtext">
          Based on {collectionSize} cards you own. Pick a concept and the Smith
          will forge a full deck using only your cards (plus basic lands), then analyse it.
        </p>
      </div>

      {suggestions.map((s, i) => {
        const identity = String(s.identity ?? "")
          .split("")
          .filter((c) => IDENTITY_SORT.includes(c))
          .sort((a, b) => IDENTITY_SORT.indexOf(a) - IDENTITY_SORT.indexOf(b));
        const isForging = forging && chosen === i;
        const info = scryfallData?.get(String(s.commander ?? "").toLowerCase());
        const artUrl = info?.art_crop_uri ?? info?.image_uri ?? null;
        return (
          <div
            className="panel"
            key={i}
            style={{
              marginBottom: "1.25rem",
              ...(artUrl
                ? {
                    backgroundImage: `linear-gradient(to right, rgba(7,7,26,0.96) 45%, rgba(7,7,26,0.78) 72%, rgba(7,7,26,0.55) 100%), url(${artUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center 25%",
                  }
                : {}),
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
              <CommanderName name={s.commander} scryfallData={scryfallData} />
              {identity.map((c) => <ManaSymbol key={c} colour={c} />)}
              <span className="tag tag-gold">{s.archetype}</span>
              {s.bracket && <span className="tag tag-purple">Bracket {s.bracket}</span>}
            </div>

            <p style={{ margin: "0.6rem 0", fontSize: "0.95rem", color: "var(--text)" }}>{s.strategy}</p>

            {s.key_cards?.length > 0 && (
              <>
                <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: "0.3rem" }}>
                  You already own:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
                  {s.key_cards.map((name) => (
                    <CardChip key={name} name={name} scryfallData={scryfallData} />
                  ))}
                </div>
              </>
            )}

            {s.missing_pieces?.length > 0 && (
              <>
                <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: "0.3rem" }}>
                  Cheap upgrades worth picking up:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
                  {s.missing_pieces.map((name) => (
                    <CardChip key={name} name={name} scryfallData={scryfallData} muted />
                  ))}
                </div>
              </>
            )}

            {s.completeness && (
              <p style={{ fontSize: "0.82rem", color: "var(--muted)", fontStyle: "italic", margin: "0 0 0.75rem" }}>
                {s.completeness}
              </p>
            )}

            <button
              className="btn btn-primary"
              disabled={forging}
              onClick={() => { setChosen(i); onForge(s); }}
            >
              {isForging ? "Forging…" : "Forge This Deck →"}
            </button>
          </div>
        );
      })}

      <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
        <button className="btn btn-secondary" onClick={onBack} disabled={forging}>
          ← Return to the Forge
        </button>
      </div>
    </div>
  );
}
