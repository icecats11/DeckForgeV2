import { useState } from "react";

export default function CollectionInput({ onSuggest, disabled }) {
  const [text, setText] = useState("");

  const lineCount = text.split(/\r?\n/).filter((l) => l.trim()).length;

  return (
    <div className="card deck-input-section">
      <div className="generate-heading">Forge From Your Collection</div>
      <p className="generate-subtext">
        Paste the cards you own and the Smith will find the commanders hiding
        in your collection and suggest decks you can build from what you already have.
      </p>
      <textarea
        className="deck-paste"
        placeholder={
          "Paste your collection here — any common format works:\n\n1 Sol Ring\n4x Lightning Bolt (2XM) 129\nMeren of Clan Nel Toth\n...\n\nQuantities and set codes are optional."
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <div className="input-actions">
        <button
          className="btn btn-primary"
          onClick={() => text.trim() && onSuggest(text)}
          disabled={disabled || lineCount < 20}
          title={lineCount < 20 ? "Paste at least ~20 cards" : undefined}
        >
          Find My Decks →
        </button>
        <span style={{ color: "var(--muted)", fontSize: "0.82rem", alignSelf: "center" }}>
          {lineCount > 0 ? `${lineCount} lines` : "Works best with 50+ cards"}
        </span>
      </div>
    </div>
  );
}
