export default async function handler(req, res) {
  const { deckId } = req.query;

  if (!deckId) {
    return res.status(400).json({ error: "Missing deckId" });
  }

  try {
    const upstream = await fetch(
      `https://api2.moxfield.com/v2/decks/all/${encodeURIComponent(deckId)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://www.moxfield.com/",
          "Origin": "https://www.moxfield.com",
          "Accept": "application/json",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      }
    );

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Moxfield returned ${upstream.status}` });
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Could not reach Moxfield." });
  }
}
