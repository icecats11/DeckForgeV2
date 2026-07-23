import { useState } from "react";

export default function DiagnosticLog({ logs }) {
  const [open, setOpen] = useState(false);

  if (!logs || logs.length === 0) return null;

  return (
    <div className="diag-wrap">
      <button className="diag-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "▲ Hide" : "▼ Show"} diagnostic log ({logs.length} entries)
      </button>
      {open && (
        <div className="diag-log">
          {logs.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
