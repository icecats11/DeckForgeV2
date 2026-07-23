import { createClient } from "@supabase/supabase-js";
import { applyCors } from "./_lib/http.js";
import { checkRateLimit } from "./_lib/ratelimit.js";

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkRateLimit(req, res, { max: 3, name: "feedback" })) return;

  const { commander, archetype, rating, feedback } = req.body || {};
  if (!feedback?.trim()) return res.status(400).json({ error: "Feedback is required" });
  if (feedback.length > 4000) return res.status(400).json({ error: "Feedback too long (max 4000 characters)." });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Feedback storage not configured on server" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { error } = await supabase.from("feedback").insert({
    commander: commander || null,
    archetype: archetype || null,
    rating: rating || null,
    feedback: feedback.trim(),
  });

  if (error) {
    console.error("Supabase feedback error:", error);
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true });
}
