import { useEffect, useState } from "react";
import type { MeResponse, PostDraft, SlotConfig } from "@tgap/shared";
import { api } from "../api.js";
import { haptic } from "../telegram.js";
import { Empty, Loading } from "./Analysis.js";

interface Props {
  channelId: string | null;
  me: MeResponse | null;
  toast: (m: string) => void;
  onQuota: () => void;
  refreshMe: () => void;
}

export function Studio({ channelId, me, toast, onQuota, refreshMe }: Props) {
  const [slots, setSlots] = useState<SlotConfig[]>([]);
  const [drafts, setDrafts] = useState<PostDraft[] | null>(null);
  const [topic, setTopic] = useState("");
  const [slotId, setSlotId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!channelId) return;
    api.slots(channelId).then((r) => { setSlots(r.slots); if (!slotId) setSlotId(r.slots[0]?.slotId ?? ""); });
    api.drafts(channelId).then((r) => setDrafts(r.drafts.slice().reverse()));
  };
  useEffect(() => { setDrafts(null); load(); }, [channelId]);

  if (!channelId) return <Empty text="Connect a channel to start drafting posts." />;

  const generate = async () => {
    setBusy(true);
    try {
      const { draft } = await api.generate(channelId, { slotId, topic: topic.trim() || undefined });
      setDrafts((prev) => [draft, ...(prev ?? [])]);
      refreshMe();
      haptic("success");
      toast("Draft ready");
    } catch (e) {
      if ((e as { status?: number }).status === 402) onQuota();
      else toast((e as Error).message);
    } finally { setBusy(false); }
  };

  const act = async (d: PostDraft, action: string, text?: string) => {
    const { draft } = await api.draftAction(d.id, { action, text });
    setDrafts((prev) => prev!.map((x) => (x.id === draft.id ? draft : x)));
    haptic(action === "approve" ? "success" : "light");
    toast(action === "approve" ? "Approved ✅" : action === "decline" ? "Declined" : "Updated");
  };

  return (
    <>
      <div className="card">
        <div className="spread"><h2>Studio</h2>
          {me && <span className="muted">{me.access.remainingToday === null ? "unlimited" : `${me.access.remainingToday} left today`}</span>}
        </div>
        <label className="lbl">Slot</label>
        <select className="field" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
          {slots.map((s) => <option key={s.slotId} value={s.slotId}>{s.postType} · {s.cadence}</option>)}
        </select>
        <label className="lbl">Topic (optional)</label>
        <input className="field" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Leave blank to let the AI choose" />
        <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy} onClick={generate}>
          {busy ? "Generating…" : "✨ Generate a draft"}
        </button>
      </div>

      <div className="section-title">Drafts</div>
      {!drafts ? <Loading /> : drafts.length === 0 ? <Empty text="No drafts yet." /> : drafts.map((d) => (
        <DraftCard key={d.id} d={d} onAction={act} />
      ))}
    </>
  );
}

function DraftCard({ d, onAction }: { d: PostDraft; onAction: (d: PostDraft, a: string, t?: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(d.text);
  const done = d.status === "approved" || d.status === "declined";

  return (
    <div className="card" style={done ? { opacity: 0.7 } : undefined}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="chip ai">{d.postType}</span>
        <StatusChip status={d.status} />
      </div>
      {d.imageUrl && <img className="draft-img" src={d.imageUrl} alt="" />}
      {editing ? (
        <textarea className="field" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 120 }} />
      ) : (
        <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>{d.text}</div>
      )}

      <details className="prompt" style={{ marginTop: 10 }}>
        <summary>🔎 See the exact prompt used</summary>
        <pre>{d.generationPrompt}</pre>
      </details>

      {!done && (
        <div className="row" style={{ marginTop: 12 }}>
          {editing ? (
            <>
              <button className="btn ok" onClick={() => { onAction(d, "edit", text); setEditing(false); }}>Save</button>
              <button className="btn ghost" onClick={() => { setText(d.text); setEditing(false); }}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn ok" onClick={() => onAction(d, "approve")}>✅ Confirm</button>
              <button className="btn" onClick={() => setEditing(true)}>✏️ Edit</button>
              <button className="btn danger" onClick={() => onAction(d, "decline")}>❌ Decline</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = { approved: "var(--ok)", edited: "var(--accent)", declined: "var(--danger)", pending: "var(--warn)" };
  return <span className="chip"><span className="dot" style={{ color: map[status] ?? "var(--tg-hint)" }} />{status}</span>;
}
