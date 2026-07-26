import { useEffect, useState } from "react";
import type { SlotConfig } from "@tgap/shared";
import { api } from "../api.js";
import { Empty, Loading } from "./Analysis.js";

export function Schedule({ channelId, toast }: { channelId: string | null; toast: (m: string) => void }) {
  const [slots, setSlots] = useState<SlotConfig[] | null>(null);

  useEffect(() => {
    if (!channelId) return;
    setSlots(null);
    api.slots(channelId).then((r) => setSlots(r.slots));
  }, [channelId]);

  if (!channelId) return <Empty text="Connect a channel to tune its schedule." />;
  if (!slots) return <Loading />;
  if (slots.length === 0) return <Empty text="No recurring slots detected." />;

  const save = async (s: SlotConfig, patch: Partial<SlotConfig>) => {
    const { slot } = await api.updateSlot(s.slotId, patch);
    setSlots((prev) => prev!.map((x) => (x.slotId === slot.slotId ? slot : x)));
    toast("Saved");
  };

  return (
    <>
      <div className="card">
        <h2>Schedule & prompts</h2>
        <p className="muted">Adjust when each type posts, toggle images, and edit the exact style prompt. Full transparency — nothing hidden.</p>
      </div>

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

          <label className="lbl">Cadence</label>
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

          <label className="lbl">Style prompt (editable & appendable)</label>
          <textarea className="field mono" defaultValue={s.stylePrompt}
            onBlur={(e) => e.target.value !== s.stylePrompt && save(s, { stylePrompt: e.target.value })} />
        </div>
      ))}
    </>
  );
}
