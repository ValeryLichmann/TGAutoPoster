import { useEffect, useState } from "react";
import type { ChannelAnalysis } from "@tgap/shared";
import { api } from "../api.js";

export function Analysis({ channelId }: { channelId: string | null }) {
  const [a, setA] = useState<ChannelAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channelId) return;
    setLoading(true);
    api.analysis(channelId).then((r) => setA(r.analysis)).finally(() => setLoading(false));
  }, [channelId]);

  if (!channelId) return <Empty text="Connect a channel to see analytics." />;
  if (loading || !a) return <Loading />;

  return (
    <>
      <div className="card">
        <h2>{a.channelTitle}</h2>
        <p className="muted">{a.narrative}</p>
      </div>

      <div className="stat-grid">
        <Stat n={a.window.totalPosts} l="posts analysed" />
        <Stat n={a.avgPostsPerDay} l="avg / day" />
        <Stat n={a.avgPostsPerWeek} l="avg / week" />
        <Stat n={`${Math.round(a.confidence * 100)}%`} l="confidence" />
      </div>

      <div className="section-title">Content mix</div>
      <div className="card">
        {a.typeMix.slice(0, 6).map((t) => (
          <div key={t.type} style={{ marginBottom: 10 }}>
            <div className="spread" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t.type}</span>
              <span className="muted">{Math.round(t.share * 100)}%</span>
            </div>
            <div className="bar"><span style={{ width: `${Math.round(t.share * 100)}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="section-title">Detected schedule</div>
      {a.slots.map((s) => (
        <div key={s.id} className="card spread">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</div>
            <span className="muted">{s.periodicity} · {s.postType}</span>
          </div>
          <span className="chip"><span className="dot" style={{ color: conf(s.confidence) }} />{Math.round(s.confidence * 100)}%</span>
        </div>
      ))}

      {a.gaps.length > 0 && (
        <>
          <div className="section-title">Waves & inactivity</div>
          <div className="card">
            {a.gaps.map((g, i) => (
              <div key={i} className="spread" style={{ padding: "4px 0" }}>
                <span className="muted">{g.start.slice(0, 10)} → {g.end.slice(0, 10)}</span>
                <span className="chip">{g.days}d quiet</span>
              </div>
            ))}
          </div>
        </>
      )}

      {a.eras.length > 1 && (
        <>
          <div className="section-title">Eras</div>
          {a.eras.map((e, i) => (
            <div key={i} className="card">
              <div className="spread"><strong style={{ fontSize: 13 }}>Era {i + 1}</strong>
                <span className="muted">{e.start.slice(0, 10)} → {e.end.slice(0, 10)}</span></div>
              <p className="muted" style={{ margin: "6px 0 0" }}>{e.summary}</p>
            </div>
          ))}
        </>
      )}
    </>
  );
}

const conf = (c: number) => (c > 0.66 ? "var(--ok)" : c > 0.4 ? "var(--warn)" : "var(--danger)");

function Stat({ n, l }: { n: number | string; l: string }) {
  return <div className="stat"><div className="n">{n}</div><div className="l">{l}</div></div>;
}
export function Loading() {
  return <div className="card">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ margin: "8px 0", width: `${90 - i * 15}%` }} />)}</div>;
}
export function Empty({ text }: { text: string }) {
  return <div className="card center"><p className="muted" style={{ margin: "24px 0" }}>{text}</p></div>;
}
