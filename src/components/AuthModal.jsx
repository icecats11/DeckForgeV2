import { useState } from "react";
import { supabase } from "../utils/supabase.js";

// Map username to a synthetic email so Supabase auth is happy
function toEmail(username) {
  return `${username.toLowerCase().trim()}@deckforge.internal`;
}

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!supabase) {
    return (
      <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal-box">
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="modal-title">DeckForge Account</div>
          <div className="modal-error" style={{ marginTop: "1rem" }}>
            Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> file.
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const email = toEmail(username);

      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw new Error("Invalid username or password.");
        onClose();
      } else {
        if (username.length < 3) throw new Error("Username must be at least 3 characters.");
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
          throw new Error("Username can only contain letters, numbers, _ and -.");
        }
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (authError) throw authError;
        setSuccess("Account created! You can now sign in.");
        setMode("login");
        setPassword("");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title">DeckForge Account</div>

        <div className="modal-tabs">
          <button
            className={`modal-tab${mode === "login" ? " active" : ""}`}
            onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`modal-tab${mode === "register" ? " active" : ""}`}
            onClick={() => { setMode("register"); setError(null); setSuccess(null); }}
            type="button"
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="your_username"
            />
          </div>
          <div className="modal-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="••••••••"
            />
          </div>

          {error && <div className="modal-error">{error}</div>}
          {success && <div className="modal-success">{success}</div>}

          {mode === "register" && (
            <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0.25rem 0 0.75rem", lineHeight: 1.5 }}>
              Accounts are username-only — there's no email on file, so a
              forgotten password <strong>cannot be recovered</strong>. Keep it
              somewhere safe (a password manager is ideal).
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            disabled={loading}
          >
            {loading ? "Working…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
