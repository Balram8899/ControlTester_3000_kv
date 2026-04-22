import { useEffect } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Box,
  CheckCircle2,
  CircleCheck,
  ClipboardList,
  Database,
  Download,
  FileCheck2,
  LayoutGrid,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";
import logo from "@/assets/kpmg (1).png";
import { LANDING_MODULES } from "@/pages/landing.helpers";

const fontHref =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap";

const metrics = [
  { label: "Controls tested", value: "1,248", delta: "+12%", tone: "#00338D" },
  { label: "Evidence accepted", value: "91%", delta: "+6 pts", tone: "#009A44" },
  { label: "Open issues", value: "37", delta: "-8", tone: "#EAAA00" },
  { label: "Critical gaps", value: "6", delta: "-3", tone: "#E5001B" },
];

const previewModules = LANDING_MODULES.slice(0, 6);

const referenceSidebarItems = [
  { label: "Overview", Icon: LayoutGrid },
  { label: "Domains", Icon: Box },
  { label: "Obligations", Icon: ClipboardList },
  { label: "Mapping Status", Icon: CircleCheck },
  { label: "Reports", Icon: BarChart3 },
  { label: "Data Quality", Icon: ShieldCheck },
  { label: "Export", Icon: Download },
];

const workQueue = [
  { id: "CTL-2048", owner: "Access review", status: "Ready", score: "94" },
  { id: "CTL-1187", owner: "Change approval", status: "Testing", score: "82" },
  { id: "CTL-0705", owner: "Backup recovery", status: "Blocked", score: "61" },
  { id: "CTL-3312", owner: "Third-party review", status: "Ready", score: "88" },
];

function usePreviewFonts() {
  useEffect(() => {
    if (document.getElementById("dtlh-font-preview")) return;

    const link = document.createElement("link");
    link.id = "dtlh-font-preview";
    link.rel = "stylesheet";
    link.href = fontHref;
    document.head.appendChild(link);
  }, []);
}

function MetricCard({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: string;
}) {
  return (
    <div className="dtlh-metric">
      <span className="dtlh-metric-rule" style={{ backgroundColor: tone }} />
      <p>{label}</p>
      <div>
        <strong>{value}</strong>
        <span style={{ color: tone }}>{delta}</span>
      </div>
    </div>
  );
}

export default function FontMockupPage() {
  usePreviewFonts();

  return (
    <div className="dtlh-font-mockup">
      <style>{`
        .dtlh-font-mockup {
          --font-sans: 'Inter', Arial, sans-serif;
          --font-display: 'Plus Jakarta Sans', 'Inter', Arial, sans-serif;
          --font-mono: 'JetBrains Mono', Consolas, monospace;
          min-height: 100vh;
          background: linear-gradient(180deg, #f8fbff 0%, #eef4fb 48%, #ffffff 100%);
          color: #0C233C;
          font-family: var(--font-sans);
        }

        .dtlh-font-mockup * {
          box-sizing: border-box;
        }

        .dtlh-shell {
          display: grid;
          min-height: 100vh;
          grid-template-columns: 154px minmax(0, 1fr);
        }

        .dtlh-sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          overflow: hidden;
          background: #00338D;
          color: #FFFFFF;
          border-right: 0;
        }

        .dtlh-sidebar-inner {
          position: relative;
          z-index: 1;
          display: flex;
          height: 100%;
          flex-direction: column;
          padding: 20px 10px 24px;
        }

        .dtlh-brand {
          display: flex;
          align-items: center;
          min-height: 44px;
          padding: 0 12px;
        }

        .dtlh-logo-hold {
          display: flex;
          height: 39px;
          align-items: center;
          background: transparent;
          padding: 0;
        }

        .dtlh-logo-hold img {
          height: auto;
          width: 94px;
          display: block;
          filter: brightness(0) invert(1);
          opacity: 0.98;
        }

        .dtlh-brand-kicker,
        .dtlh-eyebrow,
        .dtlh-section-kicker {
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
        }

        .dtlh-brand-kicker {
          color: #ACEAFF;
        }

        .dtlh-brand h1,
        .dtlh-hero h2,
        .dtlh-panel-title,
        .dtlh-type-card strong,
        .dtlh-metric strong,
        .dtlh-work-title,
        .dtlh-insight-value {
          font-family: var(--font-display);
          letter-spacing: -0.02em;
        }

        .dtlh-nav {
          display: grid;
          gap: 4px;
          margin-top: 16px;
        }

        .dtlh-nav button {
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 36px;
          border: 0;
          border-radius: 4px;
          background: transparent;
          color: rgba(255,255,255,0.94);
          cursor: default;
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          padding: 0 12px;
          text-align: left;
          transition: background 160ms ease, color 160ms ease;
        }

        .dtlh-nav button:first-child {
          background: #1759C9;
          color: #fff;
        }

        .dtlh-nav button:hover {
          background: rgba(255,255,255,0.12);
          color: #fff;
        }

        .dtlh-nav svg {
          width: 13px;
          height: 13px;
          stroke-width: 2;
        }

        .dtlh-export-mark {
          width: 4px;
          height: 16px;
          margin: 6px auto 0;
          background: #43B02A;
        }

        .dtlh-sidebar-footer {
          margin-top: auto;
          border-top: 1px solid rgba(255,255,255,0.2);
          border-radius: 0;
          background: transparent;
          padding: 12px 7px 0;
        }

        .dtlh-sidebar-footer p {
          margin: 0;
          color: #FFFFFF;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.45;
        }

        .dtlh-sidebar-footer p + p {
          margin-top: 3px;
        }

        .dtlh-main {
          min-width: 0;
        }

        .dtlh-topbar {
          position: sticky;
          top: 0;
          z-index: 5;
          display: flex;
          height: 68px;
          align-items: center;
          gap: 14px;
          border-bottom: 1px solid rgba(0,51,141,0.1);
          background: rgba(255,255,255,0.92);
          padding: 0 28px;
          backdrop-filter: blur(14px);
        }

        .dtlh-search {
          display: flex;
          min-width: 260px;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(0,51,141,0.12);
          border-radius: 8px;
          background: #F6F8FB;
          padding: 10px 12px;
          color: #5B6B82;
          font-size: 13px;
        }

        .dtlh-topbar-spacer {
          flex: 1;
        }

        .dtlh-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(0,154,68,0.18);
          border-radius: 999px;
          background: rgba(0,154,68,0.08);
          color: #00763C;
          padding: 7px 11px;
          font-size: 12px;
          font-weight: 700;
        }

        .dtlh-page {
          padding: 28px;
        }

        .dtlh-hero {
          position: relative;
          overflow: hidden;
          border-radius: 0;
          background: #00338D;
          color: #fff;
          padding: 34px;
        }

        .dtlh-hero::after {
          content: "";
          position: absolute;
          right: 36px;
          top: 28px;
          width: 240px;
          height: 168px;
          border: 12px solid rgba(172,234,255,0.28);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.22);
        }

        .dtlh-eyebrow {
          margin: 0 0 18px;
          color: #ACEAFF;
        }

        .dtlh-hero h2 {
          position: relative;
          z-index: 1;
          max-width: 760px;
          margin: 0;
          color: #fff;
          font-size: clamp(38px, 5vw, 68px);
          font-weight: 800;
          line-height: 0.98;
        }

        .dtlh-hero p {
          position: relative;
          z-index: 1;
          max-width: 660px;
          margin: 18px 0 0;
          color: #D7E4FA;
          font-size: 16px;
          line-height: 1.7;
        }

        .dtlh-hero-actions {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 28px;
        }

        .dtlh-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          border: 0;
          border-radius: 8px;
          background: #fff;
          color: #00338D;
          padding: 0 16px;
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 800;
        }

        .dtlh-button.secondary {
          border: 1px solid rgba(255,255,255,0.24);
          background: rgba(255,255,255,0.1);
          color: #fff;
        }

        .dtlh-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.8fr);
          gap: 18px;
          margin-top: 18px;
        }

        .dtlh-panel,
        .dtlh-metric,
        .dtlh-type-card {
          border: 1px solid rgba(0,51,141,0.1);
          background: rgba(255,255,255,0.94);
          box-shadow: 0 18px 34px -30px rgba(12,35,60,0.36);
        }

        .dtlh-panel {
          border-radius: 10px;
          padding: 20px;
        }

        .dtlh-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .dtlh-section-kicker {
          margin: 0 0 6px;
          color: #00338D;
        }

        .dtlh-panel-title {
          margin: 0;
          color: #0C233C;
          font-size: 22px;
          font-weight: 800;
          line-height: 1.1;
        }

        .dtlh-panel-subtitle {
          margin: 7px 0 0;
          color: #5B6B82;
          font-size: 13px;
          line-height: 1.6;
        }

        .dtlh-metric-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .dtlh-metric {
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          padding: 17px;
        }

        .dtlh-metric-rule {
          position: absolute;
          inset: 0 auto 0 0;
          width: 4px;
        }

        .dtlh-metric p {
          margin: 0 0 12px;
          color: #5B6B82;
          font-size: 12px;
          font-weight: 700;
        }

        .dtlh-metric div {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 10px;
        }

        .dtlh-metric strong {
          color: #0C233C;
          font-size: 32px;
          font-weight: 800;
          line-height: 0.95;
        }

        .dtlh-metric span:last-child {
          font-size: 12px;
          font-weight: 800;
        }

        .dtlh-chart {
          display: grid;
          height: 260px;
          grid-template-columns: repeat(9, 1fr);
          align-items: end;
          gap: 10px;
          border-radius: 8px;
          background:
            linear-gradient(180deg, rgba(0,51,141,0.05) 1px, transparent 1px) 0 0 / 100% 52px,
            #F8FAFE;
          padding: 20px;
        }

        .dtlh-bar {
          border-radius: 6px 6px 2px 2px;
          background: linear-gradient(180deg, #1E49E2, #00338D);
        }

        .dtlh-current-modules {
          margin-top: 18px;
        }

        .dtlh-module-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .dtlh-module-tile {
          position: relative;
          min-height: 138px;
          overflow: hidden;
          border: 1px solid rgba(0,51,141,0.1);
          border-radius: 8px;
          background: #fff;
          padding: 16px;
        }

        .dtlh-module-tile::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 4px;
          background: var(--module-accent);
        }

        .dtlh-module-tile span {
          color: #5B6B82;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .dtlh-module-tile strong {
          display: block;
          margin-top: 9px;
          color: #0C233C;
          font-family: var(--font-display);
          font-size: 19px;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.05;
        }

        .dtlh-module-tile p {
          margin: 10px 0 0;
          color: #5B6B82;
          font-size: 12px;
          line-height: 1.5;
        }

        .dtlh-workflow {
          display: grid;
          gap: 12px;
        }

        .dtlh-step {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(0,51,141,0.09);
          border-radius: 8px;
          background: #fff;
          padding: 13px;
        }

        .dtlh-step-icon {
          display: grid;
          height: 42px;
          width: 42px;
          place-items: center;
          border-radius: 8px;
          background: #EEF4FB;
          color: #00338D;
        }

        .dtlh-work-title {
          margin: 0;
          color: #0C233C;
          font-size: 15px;
          font-weight: 800;
        }

        .dtlh-step p:last-child {
          margin: 4px 0 0;
          color: #5B6B82;
          font-size: 12px;
        }

        .dtlh-step code,
        .dtlh-table code,
        .dtlh-mono {
          font-family: var(--font-mono);
        }

        .dtlh-step code {
          color: #00338D;
          font-size: 12px;
          font-weight: 700;
        }

        .dtlh-table {
          width: 100%;
          border-collapse: collapse;
        }

        .dtlh-table th {
          border-bottom: 1px solid rgba(0,51,141,0.1);
          color: #5B6B82;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.8px;
          padding: 10px 8px;
          text-align: left;
          text-transform: uppercase;
        }

        .dtlh-table td {
          border-bottom: 1px solid rgba(0,51,141,0.07);
          color: #0C233C;
          font-size: 13px;
          padding: 13px 8px;
        }

        .dtlh-table code {
          color: #00338D;
          font-size: 12px;
          font-weight: 700;
        }

        .dtlh-status {
          display: inline-flex;
          border-radius: 999px;
          background: #EEF4FB;
          color: #00338D;
          padding: 4px 9px;
          font-size: 11px;
          font-weight: 800;
        }

        .dtlh-insight-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .dtlh-insight {
          border-left: 3px solid #00B8F5;
          background: #F8FAFE;
          padding: 14px;
        }

        .dtlh-insight-value {
          color: #00338D;
          font-size: 28px;
          font-weight: 800;
          line-height: 1;
        }

        .dtlh-insight p {
          margin: 7px 0 0;
          color: #5B6B82;
          font-size: 12px;
          line-height: 1.5;
        }

        .dtlh-type-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          gap: 12px;
        }

        .dtlh-type-card {
          border-radius: 8px;
          padding: 18px;
        }

        .dtlh-type-card span {
          display: block;
          margin-bottom: 12px;
          color: #5B6B82;
          font-size: 12px;
          font-weight: 800;
        }

        .dtlh-type-card strong {
          display: block;
          color: #0C233C;
          font-size: 30px;
          font-weight: 800;
          line-height: 1.05;
        }

        .dtlh-type-card p {
          margin: 12px 0 0;
          color: #5B6B82;
          font-size: 13px;
          line-height: 1.6;
        }

        .dtlh-type-card.mono strong {
          color: #00338D;
          font-family: var(--font-mono);
          font-size: 22px;
          letter-spacing: 0;
        }

        @media (max-width: 1120px) {
          .dtlh-shell {
            grid-template-columns: 1fr;
          }

          .dtlh-sidebar {
            position: relative;
            height: auto;
          }

          .dtlh-sidebar-inner {
            padding: 20px;
          }

          .dtlh-nav {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .dtlh-grid,
          .dtlh-type-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .dtlh-topbar {
            height: auto;
            flex-wrap: wrap;
            padding: 16px;
          }

          .dtlh-search {
            min-width: 0;
            width: 100%;
            order: 3;
          }

          .dtlh-page {
            padding: 16px;
          }

          .dtlh-hero {
            padding: 26px 22px;
          }

          .dtlh-hero::after {
            display: none;
          }

          .dtlh-hero h2 {
            font-size: 38px;
          }

          .dtlh-metric-grid,
          .dtlh-insight-strip,
          .dtlh-module-grid {
            grid-template-columns: 1fr;
          }

          .dtlh-nav {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="dtlh-shell">
        <aside className="dtlh-sidebar">
          <div className="dtlh-sidebar-inner">
            <div className="dtlh-brand">
              <div className="dtlh-logo-hold">
                <img src={logo} alt="KPMG" />
              </div>
            </div>

            <nav className="dtlh-nav" aria-label="Mock navigation">
              {referenceSidebarItems.map(({ label, Icon }) => (
                <button key={label} type="button">
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <div className="dtlh-export-mark" aria-hidden="true" />

            <div className="dtlh-sidebar-footer">
              <p>Last refreshed</p>
              <p>19 Apr 2026 10:30</p>
            </div>
          </div>
        </aside>

        <main className="dtlh-main">
          <header className="dtlh-topbar">
            <div className="dtlh-search">
              <Search size={16} />
              <span>Search controls, risks, obligations</span>
            </div>
            <div className="dtlh-topbar-spacer" />
            <span className="dtlh-status-pill">
              <CheckCircle2 size={14} />
              Preview active
            </span>
            <span className="dtlh-mono text-[12px] text-[#5B6B82]">TRACE-UI-3000</span>
          </header>

          <div className="dtlh-page">
            <section className="dtlh-hero">
              <p className="dtlh-eyebrow">KPMG TRACE workspace</p>
              <h2>Control testing with the DTLH Apex font system.</h2>
              <p>
                A mock workspace showing how the local ControlTester experience reads when the GitHub
                repo typography replaces the current KPMG Open Sans treatment.
              </p>
              <div className="dtlh-hero-actions">
                <button type="button" className="dtlh-button">
                  Review assessment <ArrowUpRight size={15} />
                </button>
                <button type="button" className="dtlh-button secondary">
                  Compare modules
                </button>
              </div>
            </section>

            <section className="dtlh-panel dtlh-current-modules" aria-label="Current repository modules">
              <div className="dtlh-panel-header">
                <div>
                  <p className="dtlh-section-kicker">Current local repo</p>
                  <h3 className="dtlh-panel-title">Existing module map with the new font treatment</h3>
                  <p className="dtlh-panel-subtitle">
                    Module names and descriptions are pulled from the current landing page metadata.
                  </p>
                </div>
                <Database color="#00338D" size={24} />
              </div>

              <div className="dtlh-module-grid">
                {previewModules.map((module) => (
                  <div
                    key={module.path}
                    className="dtlh-module-tile"
                    style={{ "--module-accent": module.accent } as React.CSSProperties}
                  >
                    <span>{module.eyebrow}</span>
                    <strong>{module.title}</strong>
                    <p>{module.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="dtlh-grid" aria-label="Dashboard mockup">
              <div className="dtlh-panel">
                <div className="dtlh-panel-header">
                  <div>
                    <p className="dtlh-section-kicker">Portfolio status</p>
                    <h3 className="dtlh-panel-title">Selected library metrics</h3>
                    <p className="dtlh-panel-subtitle">
                      Dense dashboard text with Inter body copy and Plus Jakarta Sans display numbers.
                    </p>
                  </div>
                  <BarChart3 color="#00338D" size={24} />
                </div>

                <div className="dtlh-metric-grid">
                  {metrics.map((metric) => (
                    <MetricCard key={metric.label} {...metric} />
                  ))}
                </div>

                <div className="dtlh-chart" aria-hidden="true">
                  {[54, 72, 45, 84, 62, 91, 76, 68, 88].map((height, index) => (
                    <span
                      key={index}
                      className="dtlh-bar"
                      style={{ height: `${height}%`, opacity: 0.65 + index * 0.035 }}
                    />
                  ))}
                </div>
              </div>

              <div className="dtlh-panel">
                <div className="dtlh-panel-header">
                  <div>
                    <p className="dtlh-section-kicker">Assessment flow</p>
                    <h3 className="dtlh-panel-title">Current cycle</h3>
                    <p className="dtlh-panel-subtitle">
                      Mono IDs stand out without making the workspace feel technical-heavy.
                    </p>
                  </div>
                  <Activity color="#00B8F5" size={24} />
                </div>

                <div className="dtlh-workflow">
                  {[
                    ["1", "Evidence intake", "22 uploads waiting for review"],
                    ["2", "Design effectiveness", "8 controls need analyst sign-off"],
                    ["3", "Report pack", "Draft findings ready for export"],
                  ].map(([step, title, detail]) => (
                    <div key={step} className="dtlh-step">
                      <span className="dtlh-step-icon">
                        <LockKeyhole size={17} />
                      </span>
                      <div>
                        <p className="dtlh-work-title">{title}</p>
                        <p>{detail}</p>
                      </div>
                      <code>0{step}</code>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="dtlh-grid" aria-label="Control testing mockup">
              <div className="dtlh-panel">
                <div className="dtlh-panel-header">
                  <div>
                    <p className="dtlh-section-kicker">Control testing</p>
                    <h3 className="dtlh-panel-title">Evidence queue</h3>
                    <p className="dtlh-panel-subtitle">
                      Table density with the borrowed font stack at production-like sizes.
                    </p>
                  </div>
                  <FileCheck2 color="#00338D" size={24} />
                </div>

                <table className="dtlh-table">
                  <thead>
                    <tr>
                      <th>Control</th>
                      <th>Focus area</th>
                      <th>Status</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workQueue.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <code>{item.id}</code>
                        </td>
                        <td>{item.owner}</td>
                        <td>
                          <span className="dtlh-status">{item.status}</span>
                        </td>
                        <td>
                          <span className="dtlh-mono">{item.score}/100</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="dtlh-panel">
                <div className="dtlh-panel-header">
                  <div>
                    <p className="dtlh-section-kicker">Coverage insight</p>
                    <h3 className="dtlh-panel-title">Regulation mapping</h3>
                    <p className="dtlh-panel-subtitle">
                      A compact side panel to test small labels, numeric rhythm, and dense copy.
                    </p>
                  </div>
                  <ShieldCheck color="#098E7E" size={24} />
                </div>

                <div className="dtlh-insight-strip">
                  <div className="dtlh-insight">
                    <div className="dtlh-insight-value">84%</div>
                    <p>Mapped obligations</p>
                  </div>
                  <div className="dtlh-insight">
                    <div className="dtlh-insight-value">126</div>
                    <p>Evidence links</p>
                  </div>
                  <div className="dtlh-insight">
                    <div className="dtlh-insight-value">14</div>
                    <p>Residual gaps</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="dtlh-panel" aria-label="Typography sample">
              <div className="dtlh-panel-header">
                <div>
                  <p className="dtlh-section-kicker">Typography sample</p>
                  <h3 className="dtlh-panel-title">How the borrowed fonts land in this repo</h3>
                  <p className="dtlh-panel-subtitle">
                    Display uses Plus Jakarta Sans, body uses Inter, and IDs use JetBrains Mono.
                  </p>
                </div>
              </div>

              <div className="dtlh-type-grid">
                <div className="dtlh-type-card">
                  <span>Plus Jakarta Sans</span>
                  <strong>Audit intelligence for control owners</strong>
                  <p>Best for page titles, module names, KPI values, and primary buttons.</p>
                </div>
                <div className="dtlh-type-card">
                  <span>Inter</span>
                  <p>
                    Inter keeps tables, forms, workflow descriptions, and dense reviewer notes readable at
                    smaller product sizes.
                  </p>
                </div>
                <div className="dtlh-type-card mono">
                  <span>JetBrains Mono</span>
                  <strong>CTL-2048 / RSK-017</strong>
                  <p>Useful for control IDs, evidence hashes, job codes, and traceable references.</p>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
