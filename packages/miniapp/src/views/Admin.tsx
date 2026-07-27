import { useEffect, useState } from "react";
import type { AdminStats } from "@tgap/shared";
import { api } from "../api.js";
import { Empty, Loading } from "./Analysis.js";

export function Admin({ isAdmin }: { isAdmin: boolean }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    api.adminStats().then(setStats).catch(() => setErr(true));
  }, [isAdmin]);

  if (!isAdmin) return <Empty text="Admin panel — restricted to workspace admins." />;
  if (err) return <Empty text="Could not load admin stats." />;
  if (!stats) return <Loading />;

  const maxDay = Math.max(1, ...stats.postsPublished7d.map((d) => d.count));

  return (
    <>
      <div className="card"><h2>Admin analytics</h2><p className="muted">Product health at a glance.</p></div>
      <div className="stat-grid">
        <Stat n={stats.totalUsers} l="users" />
        <Stat n={stats.activeChannels} l="active channels" />
        <Stat n={stats.draftsGenerated} l="drafts generated" />
        <Stat n={`${Math.round(stats.approvalRate * 100)}%`} l="approval rate" />
      </div>

      <div className="section-title">AI spend (estimate)</div>
      <div className="card">
        <div className="stat-grid">
          <Stat n={fmt(stats.usage.inputTokens)} l="input tokens" />
          <Stat n={fmt(stats.usage.outputTokens)} l="output tokens" />
          <Stat n={fmt(stats.usage.cacheReadTokens)} l="cached (cheap) tokens" />
          <Stat n={`$${stats.usage.estCostUsd.toFixed(2)}`} l={`est. cost · ${stats.usage.images} images`} />
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
          Estimated from configured per-MTok prices. Routine posts use the fast model, long-form the
          smart model; the per-channel style prefix is served from prompt cache at ~10% price.
        </p>
      </div>

      <div className="section-title">Plans</div>
      <div className="card">
        {Object.entries(stats.planBreakdown).map(([plan, n]) => (
          <div key={plan} className="spread" style={{ padding: "4px 0" }}>
            <span className={`chip ${plan === "pro" ? "user" : "ai"}`}>{plan}</span>
            <strong>{n}</strong>
          </div>
        ))}
        {Object.keys(stats.planBreakdown).length === 0 && <span className="muted">No users yet.</span>}
      </div>

      <div className="section-title">Posts published · last 7 days</div>
      <div className="card">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
          {stats.postsPublished7d.map((d) => (
            <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: `${(d.count / maxDay) * 70}px`, minHeight: 3, background: "linear-gradient(180deg, var(--accent), var(--accent-2))", borderRadius: 6 }} />
              <div className="muted" style={{ fontSize: 9, marginTop: 4 }}>{d.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Stat({ n, l }: { n: number | string; l: string }) {
  return <div className="stat"><div className="n">{n}</div><div className="l">{l}</div></div>;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
