import { useState } from "react";

const SAMPLE_DECK = `Commander
1 Yawgmoth, Thran Physician

Deck
1 Sol Ring
1 Arcane Signet
1 Dark Ritual
1 Cabal Coffers
1 Urborg, Tomb of Yawgmoth
1 Blood Artist
1 Zulaport Cutthroat
1 Young Wolf
1 Geralf's Messenger
1 Viscera Seer
1 Phyrexian Altar
1 Ashnod's Altar
1 Murderous Rider
1 Gray Merchant of Asphodel
1 Mikaeus, the Unhallowed
1 Endrek Sahr, Master Breeder
1 Grim Haruspex
1 Midnight Reaper
1 Village Rites
1 Thoughtseize
1 Fatal Push
1 Demonic Tutor
1 Diabolic Intent
1 Vampiric Tutor
1 Bolas's Citadel
1 Nim Deathmantle
1 Pitiless Plunderer
1 Filth
1 Living Death
1 Toxic Deluge
35 Swamp
`;

export default function DeckInput({ onAnalyse, disabled }) {
  const [text, setText] = useState("");

  function handleSubmit() {
    if (text.trim()) onAnalyse(text);
  }

  return (
    <div className="card deck-input-section">
      <div className="generate-heading">Import Your Deck</div>
      <textarea
        className="deck-paste"
        placeholder={`Paste your decklist here...\n\nSupports Moxfield export format or sectioned format:\n\nCommander\n1 Yawgmoth, Thran Physician\n\nDeck\n1 Sol Ring\n35 Swamp`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />

      <div className="input-actions">
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
        >
          Send to the Forge →
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setText(SAMPLE_DECK)}
          disabled={disabled}
        >
          Load Sample Deck
        </button>
      </div>
    </div>
  );
}
