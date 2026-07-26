import { useCallback, useEffect, useState } from "react";
import type { MeResponse } from "@tgap/shared";
import { api } from "./api.js";
import { haptic } from "./telegram.js";
import { Home } from "./views/Home.js";
import { Analysis } from "./views/Analysis.js";
import { Sources } from "./views/Sources.js";
import { Schedule } from "./views/Schedule.js";
import { Studio } from "./views/Studio.js";
import { Support } from "./views/Support.js";
import { Admin } from "./views/Admin.js";
import { IconAdmin, IconChart, IconClock, IconHome, IconSources, IconSpark } from "./icons.js";

type Tab = "home" | "analysis" | "sources" | "schedule" | "studio" | "support" | "admin";

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [channels, setChannels] = useState<{ id: string; title: string; posts: number; avgPerDay: number; slots: number }[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [connecting, setConnecting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const notify = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); }, []);
  const refreshMe = useCallback(() => { api.me().then(setMe).catch(() => {}); }, []);

  const loadChannels = useCallback(async () => {
    const r = await api.channels();
    setChannels(r.channels);
    setChannelId((cur) => cur ?? r.channels[0]?.id ?? null);
  }, []);

  useEffect(() => { refreshMe(); loadChannels(); }, [refreshMe, loadChannels]);

  const connect = async (handle: string) => {
    setConnecting(true);
    try {
      const r = await api.connect(handle);
      await loadChannels();
      setChannelId(r.channel.id);
      setTab("analysis");
      haptic("success");
      notify(`Analysed ${r.channel.title}`);
    } catch (e) {
      notify((e as Error).message);
    } finally { setConnecting(false); }
  };

  const tabs: { id: Tab; label: string; Icon: typeof IconHome; show: boolean }[] = [
    { id: "home", label: "Home", Icon: IconHome, show: true },
    { id: "analysis", label: "Analytics", Icon: IconChart, show: true },
    { id: "sources", label: "Sources", Icon: IconSources, show: true },
    { id: "schedule", label: "Schedule", Icon: IconClock, show: true },
    { id: "studio", label: "Studio", Icon: IconSpark, show: true },
    { id: "admin", label: "Admin", Icon: IconAdmin, show: !!me?.isAdmin },
  ];

  const planBadge = me?.entitlement.plan ?? "trial";

  return (
    <div className="app">
      <header className="header">
        <div className="logo">TG</div>
        <div>
          <h1>TGAutoPoster</h1>
          <div className="sub">AI posting copilot for channels</div>
        </div>
        <span className={`badge ${planBadge}`} onClick={() => setShowUpgrade(true)} style={{ cursor: "pointer" }}>
          {planBadge === "pro" ? "★ PRO" : planBadge.toUpperCase()}
        </span>
      </header>

      {tab === "home" && (
        <Home me={me} channels={channels} connecting={connecting} onConnect={connect}
          onOpenChannel={(id) => { setChannelId(id); setTab("analysis"); }} />
      )}
      {tab === "analysis" && <Analysis channelId={channelId} />}
      {tab === "sources" && <Sources channelId={channelId} toast={notify} />}
      {tab === "schedule" && <Schedule channelId={channelId} toast={notify} />}
      {tab === "studio" && (
        <Studio channelId={channelId} me={me} toast={notify} refreshMe={refreshMe} onQuota={() => setShowUpgrade(true)} />
      )}
      {tab === "support" && <Support toast={notify} />}
      {tab === "admin" && <Admin isAdmin={!!me?.isAdmin} />}

      {/* Support entry lives off the tab bar as a floating pill on Home */}
      {tab !== "support" && (
        <button className="btn ghost" style={{ position: "fixed", right: 14, bottom: 78, zIndex: 25, background: "var(--card)", boxShadow: "var(--shadow)", borderRadius: 999 }}
          onClick={() => setTab("support")}>💬 Help</button>
      )}

      <nav className="tabbar">
        {tabs.filter((t) => t.show).map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); haptic("light"); }}>
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
      {showUpgrade && <Upgrade me={me} onClose={() => setShowUpgrade(false)} notify={notify} />}
    </div>
  );
}

function Upgrade({ me, onClose, notify }: { me: MeResponse | null; onClose: () => void; notify: (m: string) => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", alignItems: "flex-end" }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, margin: "0 auto", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div className="center">
          <div className="logo" style={{ margin: "4px auto 12px", background: "linear-gradient(135deg,#f5b301,#f08a20)" }}>★</div>
          <h2 style={{ fontSize: 18 }}>Upgrade to Pro</h2>
          <p className="muted" style={{ marginBottom: 14 }}>
            {me?.access.reason ?? "Unlock unlimited drafts."}
          </p>
        </div>
        {["Unlimited daily drafts", "All AI-discovered sources", "Priority generation & images", "Custom prompts per slot"].map((f) => (
          <div key={f} className="row" style={{ padding: "6px 0" }}><span style={{ color: "var(--ok)" }}>✓</span><span style={{ fontSize: 14 }}>{f}</span></div>
        ))}
        <button className="btn primary block" style={{ marginTop: 14 }}
          onClick={() => { notify("Telegram Stars checkout would open here"); onClose(); }}>
          ⭐ Subscribe — 250 Stars / month
        </button>
        <button className="btn ghost block" style={{ marginTop: 8 }} onClick={onClose}>Maybe later</button>
      </div>
    </div>
  );
}
