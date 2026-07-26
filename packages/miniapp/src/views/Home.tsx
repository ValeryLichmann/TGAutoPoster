import { useState } from "react";
import type { MeResponse } from "@tgap/shared";
import { HowItWorks } from "../components/HowItWorks.js";
import { Faq } from "../components/Faq.js";
import { IconLink } from "../icons.js";

interface Props {
  me: MeResponse | null;
  channels: { id: string; title: string; posts: number; slots: number }[];
  connecting: boolean;
  onConnect: (handle: string) => void;
  onOpenChannel: (id: string) => void;
}

export function Home({ me, channels, connecting, onConnect, onOpenChannel }: Props) {
  const [handle, setHandle] = useState("@demo_news");

  return (
    <>
      <div className="card" style={{ background: "linear-gradient(135deg, rgba(42,171,238,.10), rgba(34,158,217,.04))" }}>
        <h2 style={{ fontSize: 18 }}>Your channel, on autopilot ✨</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          Connect a channel and TGAutoPoster learns its rhythm, style and sources — then drafts posts
          you approve with a tap.
        </p>
        <label className="lbl">Channel username or link</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            className="field"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@yourchannel"
            spellCheck={false}
          />
          <button className="btn primary" disabled={connecting || !handle.trim()} onClick={() => onConnect(handle.trim())}>
            <IconLink width={16} height={16} />
            {connecting ? "Analysing…" : "Connect"}
          </button>
        </div>
        {me && (
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            {me.access.reason}
          </p>
        )}
      </div>

      {channels.length > 0 && (
        <>
          <div className="section-title">Your channels</div>
          {channels.map((c) => (
            <div key={c.id} className="card spread" style={{ cursor: "pointer" }} onClick={() => onOpenChannel(c.id)}>
              <div>
                <h2 style={{ marginBottom: 2 }}>{c.title}</h2>
                <span className="muted">{c.posts} posts analysed · {c.slots} slots</span>
              </div>
              <span className="chip">Open →</span>
            </div>
          ))}
        </>
      )}

      <HowItWorks />
      <Faq />
      <p className="center muted" style={{ fontSize: 11, marginTop: 18 }}>
        TGAutoPoster · you stay in control — nothing is published without your approval.
      </p>
    </>
  );
}
