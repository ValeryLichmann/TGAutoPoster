/** "How it works" — a 3-step flow with icons and a lightweight animated SVG. */
export function HowItWorks() {
  return (
    <div className="card">
      <h2>How it works</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Three steps from a raw channel to posts you just approve.
      </p>

      <div className="flow">
        <Step
          n={1}
          title="Connect"
          desc="We read up to a year of history."
          svg={
            <g className="anim-float">
              <rect x="14" y="16" width="24" height="20" rx="4" />
              <path d="M20 24h12M20 28h8" />
            </g>
          }
        />
        <Step
          n={2}
          title="Analyse"
          desc="AI learns your schedule, style & sources."
          svg={
            <g>
              <path className="anim-pulse" d="M18 34V22M26 34V16M34 34V26" strokeWidth={3} />
              <path d="M14 38h24" />
            </g>
          }
        />
        <Step
          n={3}
          title="Approve"
          desc="Drafts arrive with confirm / edit / decline."
          svg={
            <g className="anim-float">
              <circle cx="26" cy="26" r="12" />
              <path className="flow-line" d="M20 26l4 4 8-9" strokeWidth={3} />
            </g>
          }
        />
      </div>

      {/* connecting animated rail */}
      <svg viewBox="0 0 300 12" style={{ width: "100%", height: 12, marginTop: 6 }}>
        <line x1="10" y1="6" x2="290" y2="6" stroke="var(--border)" strokeWidth="2" />
        <line className="flow-line" x1="10" y1="6" x2="290" y2="6" stroke="var(--accent)" strokeWidth="2"
          strokeDasharray="280" strokeDashoffset="280" style={{ animationDuration: "1.6s" }} />
      </svg>
    </div>
  );
}

function Step({ n, title, desc, svg }: { n: number; title: string; desc: string; svg: React.ReactNode }) {
  return (
    <div className="step">
      <div className="icon">
        <svg viewBox="0 0 52 52" width="30" height="30" fill="none" stroke="currentColor"
          strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {svg}
        </svg>
      </div>
      <h3>{n}. {title}</h3>
      <p>{desc}</p>
    </div>
  );
}
