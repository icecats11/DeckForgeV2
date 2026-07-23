import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";
import rateLimit from "express-rate-limit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many requests, please try again in a minute." },
});

app.use("/api/analyse", limiter);

// Dynamically import handlers (ES modules)
const { default: analyseHandler }  = await import("./api/analyse.js");
const { default: generateHandler } = await import("./api/generate.js");
const { default: feedbackHandler } = await import("./api/feedback.js");
const { default: shareHandler }    = await import("./api/share.js");
const { default: combosHandler }   = await import("./api/combos.js");

app.options("/api/analyse", (req, res) => res.status(204).end());
app.post("/api/analyse", analyseHandler);

app.use("/api/generate", limiter);
app.options("/api/generate", (req, res) => res.status(204).end());
app.post("/api/generate", generateHandler);

app.options("/api/feedback", (req, res) => res.status(204).end());
app.post("/api/feedback", feedbackHandler);

app.options("/api/combos", (req, res) => res.status(204).end());
app.post("/api/combos", combosHandler);

app.options("/api/share", (req, res) => res.status(204).end());
app.get("/api/share", shareHandler);
app.post("/api/share", shareHandler);

// Moxfield proxy — avoids browser CORS restrictions
app.get("/api/moxfield/:deckId", async (req, res) => {
  const { deckId } = req.params;
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
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
