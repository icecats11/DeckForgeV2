// Shared helpers for the API handlers.

export function applyCors(req, res, methods = "POST, OPTIONS") {
  const origin =
    process.env.NODE_ENV === "production" ? "https://thedeckforge.co.uk" : "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true; // handled
  }
  return false;
}

// Anthropic responses can contain multiple content blocks (e.g. thinking
// blocks on some models). content[0].text silently breaks in that case —
// always pick the first text block explicitly.
export function extractText(message) {
  const block = (message?.content ?? []).find((b) => b.type === "text");
  return block?.text?.trim() ?? "";
}
