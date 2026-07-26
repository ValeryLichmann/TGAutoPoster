import { useState } from "react";
import { api } from "../api.js";
import { Faq } from "../components/Faq.js";
import { IconChat } from "../icons.js";

export function Support({ toast }: { toast: (m: string) => void }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    await api.contact(text.trim());
    setText("");
    setSent(true);
    toast("Message sent to the team");
  };

  return (
    <>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="logo" style={{ width: 34, height: 34 }}><IconChat width={18} height={18} /></div>
          <div><h2 style={{ margin: 0 }}>Contact us</h2><span className="muted">We usually reply within a day.</span></div>
        </div>
        <textarea className="field" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question, report a bug, or request a feature…" style={{ minHeight: 110 }} />
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={send}>Send message</button>
        {sent && <p className="muted center" style={{ marginTop: 10 }}>✓ Sent — we'll get back to you here in Telegram.</p>}
      </div>
      <Faq />
    </>
  );
}
