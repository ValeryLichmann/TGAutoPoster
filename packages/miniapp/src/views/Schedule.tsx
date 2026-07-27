import { useEffect, useState } from "react";
import type { AutopilotMode, SlotConfig } from "@tgap/shared";
import { api } from "../api.js";
import { Empty, Loading } from "./Analysis.js";

const AUTOPILOT_OPTIONS: { mode: AutopilotMode; label: string; desc: string }[] = [
  { mode: "manual", label: "Manual", desc: "Every draft waits for your ✅" },
  { mode: "semi", label: "Semi", desc: "Auto-publishes after a grace window unless you decline" },
  { mode: "auto", label: "Full auto", desc: "Publishes at slot times — fully replaces you" },
];

export function Schedule({ channelId, toast }: { channelId: string | null; toast: (m: string) => void }) {
  const [slots, setSlots] = useState<SlotConfig[] | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotMode>("manual");
  const [guide, setGuide] = useState<string>("");
  const [guideBusy, setGuideBusy] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    setSlots(null);
    api.slots(channelId).then((r) => setSlots(r.slots));
    api.settings(channelId).then((r) => setAutopilot(r.settings.autopilot)).catch(() => {});
    api.styleGuide(channelId).then((r) => setGuide(r.styleGuide)).catch(() => {});
  }, [channelId]);

  if (!channelId) return <Empty text="Connect a channel to tune its schedule." />;
  if (!slots) return <Loading />;

  const save = async (s: SlotConfig, patch: Partial<SlotConfig>) => {
    const { slot } = await api.updateSlot(s.slotId, patch);
    setSlots((prev) => prev!.map((x) => (x.slotId === slot.slotId ? slot : x)));
    toast("Saved");
  };

  const setMode = async (mode: AutopilotMode) => {
    setAutopilot(mode);
    await api.updateSettings(channelId, { autopilot: mode });
    toast(`Autopilot: ${mode}`);
  };

  const regenGuide = async () => {
    setGuideBusy(true);
    try {
      const r = await api.regenerateStyleGuide(channelId);
      setGuide(r.styleGuide);
      toast("Style guide regenerated from your history");
    } finally {
      setGuideBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>Autopilot</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          How autonomous should posting be? You can change this any time.
        </p>
        {AUTOPILOT_OPTIONS.map((o) => (
          <label
            key={o.mode}
            className="row"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              marginBottom: 6,
              cursor: "pointer",
              border: `1px solid ${autopilot === o.mode ? "var(--accent)" : "var(--border)"}`,
              background: autopilot === o.mode ? "rgba(42,171,238,.08)" : "transparent",
            }}
          >
            <input
              type="radio"
              name="autopilot"
              checked={autopilot === o.mode}
              onChange={() => setMode(o.mode)}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{o.label}</div>
              <div className="muted" style={{ fontSize: 12 }}>{o.desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="card">
        <div className="spread">
          <div>
            <h2>Style guide</h2>
            <span className="muted">AI-written from your history — edit freely; every draft follows it.</span>
          </div>
          <button className="btn sm" onClick={regenGuide} disabled={guideBusy}>
            {guideBusy ? "…" : "🔄 Regenerate"}
          </button>
        </div>
        <textarea
          className="field mono"
          style={{ minHeight: 180, marginTop: 10 }}
          value={guide}
          placeholder="Will be generated from your channel history on first draft…"
          onChange={(e) => setGuide(e.target.value)}
        />
        <button
          className="btn primary block"
          style={{ marginTop: 10 }}
          onClick={async () => {
            await api.saveStyleGuide(channelId, guide);
            toast("Style guide saved");
          }}
        >
          Save style guide
        </button>
      </div>

      <div className="section-title">Posting slots</div>
      {slots.length === 0 && <Empty text="No recurring slots detected." />}
      {slots.map((s) => (
        <div key={s.slotId} className="card">
          <div className="spread">
            <div className="row">
              <span className="chip ai">{s.postType}</span>
              <strong style={{ fontSize: 14 }}>{s.cadence}</strong>
            </div>
            <label className="row" style={{ gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={s.enabled} onChange={(e) => save(s, { enabled: e.target.checked })} />
              enabled
            </label>
          </div>

          <label className="lbl">Cadence (UTC)</label>
          <input className="field" defaultValue={s.cadence}
            onBlur={(e) => e.target.value !== s.cadence && save(s, { cadence: e.target.value })} />
          <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            e.g. <code>daily@09:00,18:00</code> · <code>weekly:1@12:00</code> · <code>monthly:1@10:00</code>
          </p>

          <label className="row" style={{ gap: 8, margin: "12px 0 4px", fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={s.withImage} onChange={(e) => save(s, { withImage: e.target.checked })} />
            Attach an AI image
          </label>
          {s.withImage && (
            <input className="field" defaultValue={s.imageStylePrompt} placeholder="image style…"
              onBlur={(e) => e.target.value !== s.imageStylePrompt && save(s, { imageStylePrompt: e.target.value })} />
          )}

          <label className="lbl">Slot style prompt (fallback when no style guide)</label>
          <textarea className="field mono" defaultValue={s.stylePrompt}
            onBlur={(e) => e.target.value !== s.stylePrompt && save(s, { stylePrompt: e.target.value })} />
        </div>
      ))}
    </>
  );
}
