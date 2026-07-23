// Centralised price handling.
//
// Scryfall exposes two price sources:
//   prices.usd — TCGplayer (US market)
//   prices.eur — Cardmarket (EU market)
// Since DeckForge's buy button points at Cardmarket, the EUR price is the
// one that reflects what a UK user will actually pay. Fall back to USD
// when a card has no EUR listing.
//
// Rates are approximations for display purposes only — update occasionally,
// or swap for a free FX API if you want live rates.

export const EUR_TO_GBP = 0.85;
export const USD_TO_GBP = 0.79;

/** GBP price for a Scryfall entry produced by buildEntry(). */
export function priceGbp(entry, qty = 1) {
  if (!entry) return 0;
  if (entry.price_eur > 0) return entry.price_eur * EUR_TO_GBP * qty;
  if (entry.price_usd > 0) return entry.price_usd * USD_TO_GBP * qty;
  return 0;
}
