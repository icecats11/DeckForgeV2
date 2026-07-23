import { createClient } from "@supabase/supabase-js";
import { applyCors } from "./_lib/http.js";
import { checkRateLimit } from "./_lib/ratelimit.js";

// Unauthenticated inserts of arbitrary JSON are an abuse magnet: cap the
// payload size (a full analysis + Scryfall map is ~100-200KB) and rate
// limit creation. Old rows should also be expired — see supabase/policies.sql.
const MAX_SHARE_BYTES = 400_000;

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (applyCors(req, res, "GET, POST, OPTIONS")) return;

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Sharing not configured" });

  if (req.method === "GET") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "Missing share ID" });
    const { data, error } = await supabase.from("shares").select("*").eq("id", id).single();
    if (error || !data) return res.status(404).json({ error: "Share not found" });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    if (!checkRateLimit(req, res, { max: 5, name: "share" })) return;
    const { commander, data, scryfall_data, parsed_cards, parsed_basics, total_price_gbp, is_generated } = req.body || {};
    if (!data) return res.status(400).json({ error: "Missing data" });
    try {
      if (JSON.stringify(req.body).length > MAX_SHARE_BYTES) {
        return res.status(413).json({ error: "Share payload too large." });
      }
    } catch {
      return res.status(400).json({ error: "Invalid share payload." });
    }
    const { data: row, error } = await supabase
      .from("shares")
      .insert({ commander, data, scryfall_data, parsed_cards, parsed_basics, total_price_gbp, is_generated })
      .select("id")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ id: row.id });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
