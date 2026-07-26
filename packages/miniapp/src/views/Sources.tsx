import { useEffect, useState } from "react";
import type { Source } from "@tgap/shared";
import { api } from "../api.js";
import { IconTrash } from "../icons.js";
import { Empty, Loading } from "./Analysis.js";

export function Sources({ channelId, toast }: { channelId: string | null; toast: (m: string) => void }) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ url: "", prompt: "" });

  const load = () => channelId && api.sources(channelId).then((r) => setSources(r.sources));
  useEffect(() => { setSources(null); load(); }, [channelId]);

  if (!channelId) return <Empty text="Connect a channel to manage its sources." />;
  if (!sources) return <Loading />;

  const update = async (s: Source, patch: Partial<Source>) => {
    const { source } = await api.updateSource(s.id, patch);
    setSources((prev) => prev!.map((x) => (x.id === source.id ? source : x)));
  };
  const remove = async (s: Source) => {
    await api.deleteSource(s.id);
    setSources((prev) => prev!.filter((x) => x.id !== s.id));
    toast("Source removed");
  };
  const investigate = async () => {
    setBusy(true);
    try { const r = await api.investigate(channelId); await load(); toast(`AI added ${r.sources.length} source(s)`); }
    finally { setBusy(false); }
  };
  const add = async () => {
    if (!form.url.trim()) return;
    await api.addSource(channelId, { url: form.url.trim(), title: form.url.trim(), prompt: form.prompt.trim(), kind: "website" });
    setForm({ url: "", prompt: "" });
    await load();
    toast("Source added");
  };

  return (
    <>
      <div className="card">
        <div className="spread">
          <div><h2>Sources</h2><span className="muted">Everything the AI guessed is visible — review, edit or delete.</span></div>
          <button className="btn sm primary" onClick={investigate} disabled={busy}>{busy ? "…" : "🔍 AI investigate"}</button>
        </div>
      </div>

      {sources.length === 0 && <Empty text="No sources yet — run AI investigate or add your own." />}

      {sources.map((s) => (
        <div key={s.id} className="card">
          <div className="spread">
            <div style={{ minWidth: 0 }}>
              <div className="row">
                <span className={`chip ${s.origin === "user_added" ? "user" : "ai"}`}>
                  {s.origin === "user_added" ? "yours" : s.origin === "ai_investigated" ? "AI verified" : "AI guess"}
                </span>
                <strong style={{ fontSize: 14 }}>{s.title}</strong>
              </div>
              <a className="muted" href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, wordBreak: "break-all" }}>{s.url}</a>
            </div>
            <button className="btn sm danger" onClick={() => remove(s)}><IconTrash width={15} height={15} /></button>
          </div>
          {s.rationale && <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>💡 {s.rationale}</p>}
          <label className="lbl">Custom prompt / comment for this source</label>
          <textarea className="field" style={{ minHeight: 54 }} defaultValue={s.prompt}
            placeholder="e.g. prioritise market stories, keep it neutral…"
            onBlur={(e) => e.target.value !== s.prompt && update(s, { prompt: e.target.value })} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className={`btn sm ${s.approved ? "ok" : ""}`} onClick={() => update(s, { approved: !s.approved })}>
              {s.approved ? "✓ Approved" : "Approve"}
            </button>
            <span className="chip">conf {Math.round(s.confidence * 100)}%</span>
          </div>
        </div>
      ))}

      <div className="section-title">Add your own source</div>
      <div className="card">
        <label className="lbl">URL / RSS / @channel</label>
        <input className="field" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/rss" />
        <label className="lbl">Custom prompt (optional)</label>
        <textarea className="field" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="How should posts from this source be written?" />
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={add}>Add source</button>
      </div>
    </>
  );
}
