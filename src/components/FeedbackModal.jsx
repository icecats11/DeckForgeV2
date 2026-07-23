import { useState } from "react";

export default function FeedbackModal({ commander, archetype, rating, onClose }) {
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!feedback.trim()) return;
    setStatus("submitting");
    setErrorMsg("");
    try {
      const resp = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commander, archetype, rating, feedback: feedback.trim() }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Submission failed");
      setStatus("success");
    } catch (err) {
      setErrorMsg(err.message || "Failed to submit. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-title">Leave Feedback</div>

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div className="modal-success" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              Thank you for your feedback!
            </div>
            <p style={{ color: "var(--dim)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
              Your thoughts help improve DeckForge.
            </p>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ color: "var(--dim)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
              How did the analysis perform for{" "}
              <span style={{ color: "var(--gold)" }}>{commander}</span>?
              Let us know what was helpful, inaccurate, or missing.
            </p>
            <div className="modal-field">
              <label>Your feedback</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="e.g. The synergy analysis missed the interaction between X and Y..."
                rows={5}
                required
                style={{
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: "6px", padding: "0.6rem 0.8rem",
                  color: "var(--text)", fontSize: "0.92rem",
                  width: "100%", resize: "vertical",
                  fontFamily: "inherit", lineHeight: 1.55,
                }}
              />
            </div>
            {status === "error" && <div className="modal-error">{errorMsg}</div>}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={status === "submitting" || !feedback.trim()}
                style={{ fontSize: "0.88rem", padding: "0.6rem 1.2rem" }}
              >
                {status === "submitting" ? "Sending…" : "Submit Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
