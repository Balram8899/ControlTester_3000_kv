import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, ShieldCheck, Scale, AlertTriangle, Cpu, Lock, Activity } from "lucide-react";
import Footer from "@/components/Footer";

// ── Network nodes — all constrained to left half of the viewport (x < 50) ──
const NODES = [
  { x: 9,  y: 22, r: 5, color: "#00B8F5", delay: "0s"   },
  { x: 21, y: 14, r: 4, color: "#7213EA", delay: "0.4s" },
  { x: 34, y: 28, r: 6, color: "#1E49E2", delay: "0.8s" },
  { x: 41, y: 55, r: 4, color: "#00B8F5", delay: "0.2s" },
  { x: 31, y: 68, r: 5, color: "#009A44", delay: "1s"   },
  { x: 15, y: 72, r: 4, color: "#7213EA", delay: "0.6s" },
  { x: 7,  y: 52, r: 6, color: "#098E7E", delay: "0.3s" },
  { x: 25, y: 45, r: 8, color: "#00B8F5", delay: "0.1s" },
  { x: 38, y: 82, r: 4, color: "#1E49E2", delay: "0.9s" },
  { x: 17, y: 40, r: 3, color: "#009A44", delay: "0.5s" },
  { x: 44, y: 34, r: 3, color: "#7213EA", delay: "0.7s" },
  { x: 28, y: 80, r: 4, color: "#098E7E", delay: "1.1s" },
];

const EDGES = [
  [0, 6], [0, 1], [1, 7], [1, 2], [2, 3], [3, 7],
  [7, 4], [7, 5], [4, 8], [5, 6], [3, 10], [4, 11],
  [9, 7], [9, 5], [6, 9], [10, 2],
];

// ── Floating stat cards — constrained to left ~40% of viewport ─────────────
const FLOAT_CARDS = [
  { icon: ShieldCheck,   label: "Controls mapped",    value: "1,259", color: "#009A44", x: "4%",  y: "14%" },
  { icon: Scale,         label: "Obligations active", value: "97",    color: "#1E49E2", x: "26%", y: "7%"  },
  { icon: AlertTriangle, label: "Risks identified",   value: "380",   color: "#7213EA", x: "30%", y: "72%" },
  { icon: Activity,      label: "Coverage score",     value: "84%",   color: "#098E7E", x: "3%",  y: "66%" },
];

// ── Full-width visual panel (graphics only on left half) ───────────────────
function VisualPanel() {
  return (
    <div
      className="absolute inset-0 overflow-hidden select-none"
      style={{ background: "linear-gradient(145deg, #060e1a 0%, #0c1e36 40%, #0f2548 70%, #0a1a30 100%)" }}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(#00B8F5 1px, transparent 1px), linear-gradient(90deg, #00B8F5 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Glow orbs — biased towards the left */}
      <div className="absolute rounded-full pointer-events-none" style={{ width: 500, height: 500, background: "radial-gradient(circle, rgba(114,19,234,0.22) 0%, transparent 70%)", filter: "blur(80px)", top: "-15%",  left: "-6%" }} />
      <div className="absolute rounded-full pointer-events-none" style={{ width: 400, height: 400, background: "radial-gradient(circle, rgba(0,184,245,0.18) 0%, transparent 70%)", filter: "blur(80px)", bottom: "-10%", left: "8%"  }} />
      <div className="absolute rounded-full pointer-events-none" style={{ width: 300, height: 300, background: "radial-gradient(circle, rgba(30,73,226,0.2) 0%, transparent 70%)",   filter: "blur(60px)", top: "40%",   left: "22%" }} />

      {/* Network SVG — anchored left so nodes stay in the left half */}
      <svg
        className="absolute inset-0 w-full h-full hidden lg:block"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMinYMid slice"
        style={{ opacity: 0.35 }}
      >
        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a].x} y1={NODES[a].y}
            x2={NODES[b].x} y2={NODES[b].y}
            stroke="#00B8F5"
            strokeWidth="0.3"
            strokeDasharray="1 1"
            opacity={0.6}
          />
        ))}
        {NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.x} cy={n.y} r={n.r * 0.4}
            fill={n.color}
            style={{ animation: `pulse 2.5s ease-in-out infinite`, animationDelay: n.delay }}
          />
        ))}
      </svg>

      {/* Floating stat cards — all on the left side */}
      <div className="hidden lg:block">
        {FLOAT_CARDS.map(({ icon: Icon, label, value, color, x, y }, i) => (
          <div
            key={i}
            className="absolute flex items-center gap-2.5 rounded-2xl border border-white/10 px-4 py-3"
            style={{
              left: x, top: y,
              background: "rgba(12,35,60,0.75)",
              backdropFilter: "blur(12px)",
              boxShadow: `0 0 0 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.4)`,
              animation: `float-card ${2.8 + i * 0.4}s ease-in-out infinite alternate`,
            }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl flex-shrink-0" style={{ background: color + "22", border: `1px solid ${color}44` }}>
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <div>
              <p className="text-[18px] font-bold leading-none text-white">{value}</p>
              <p className="text-[10px] text-white/50 mt-0.5 leading-none">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Central lock icon — positioned left-of-centre */}
      <div
        className="absolute top-1/2 -translate-y-1/2 hidden lg:flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/10"
        style={{
          left: "22%",
          background: "rgba(0,184,245,0.08)",
          boxShadow: "0 0 60px rgba(0,184,245,0.15), 0 0 120px rgba(114,19,234,0.1)",
        }}
      >
        <Lock className="h-8 w-8 text-[#00B8F5]" />
      </div>

      {/* Headline — bottom-left */}
      <div className="absolute bottom-10 left-8 right-8 lg:right-auto lg:max-w-[420px]">
        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#00B8F5] mb-3">Agentic Controls Platform</p>
        <h2 className="text-[28px] font-bold leading-tight text-white max-w-xs">
          Automate.<br />Detect.<br />Act.
        </h2>
        <p className="mt-3 text-[13px] leading-6 text-white/45 max-w-[280px]">
          Continuous control monitoring, regulatory gap analysis, and audit-ready evidence — at machine speed.
        </p>
      </div>

      <style>{`
        @keyframes float-card {
          from { transform: translateY(0px); }
          to   { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}

// ── Main login page ────────────────────────────────────────────────────────
export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { user, login, register } = useAuth();

  const [email, setEmail] = useState("admin@bank.com");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regError, setRegError] = useState("");
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (user) setLocation("/landing");
  }, [user, setLocation]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    const result = await login(email.trim(), password);
    if (result.ok) {
      setLocation("/landing");
    } else {
      setLoginError(result.error ?? "Login failed.");
      setLoggingIn(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError("");
    if (!regName.trim())        { setRegError("Name is required."); return; }
    if (!regEmail.trim())       { setRegError("Email is required."); return; }
    if (regPassword.length < 6) { setRegError("Password must be at least 6 characters."); return; }
    if (regPassword !== regConfirm) { setRegError("Passwords do not match."); return; }
    setRegistering(true);
    const result = await register(regName.trim(), regEmail.trim().toLowerCase(), regPassword);
    if (result.ok) {
      setShowRegister(false);
      setLocation("/landing");
    } else {
      setRegError(result.error ?? "Registration failed.");
      setRegistering(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen w-screen overflow-hidden" style={{ fontFamily: "Arial, sans-serif" }}>

      {/* ── Top KPMG banner ── */}
      <div
        className="flex-shrink-0 w-full flex items-center justify-between px-8 py-4 lg:px-14 z-30 relative"
        style={{ background: "rgba(6,14,26,0.96)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[18px] font-bold tracking-tight text-white">KPMG</span>
          <span className="text-[#1E49E2] text-[20px] font-light select-none">|</span>
          <span className="text-[18px] font-bold tracking-tight text-[#00B8F5]">Apex</span>
          <span className="hidden sm:flex items-center gap-1.5 ml-1 text-white/40 text-[13px]">
            <span>/</span>
            <span className="text-white/60">Agentic Controls Platform</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#009A44] bg-[rgba(0,154,68,0.1)] border border-[rgba(0,154,68,0.15)] px-2.5 py-1 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-[#009A44] animate-pulse" />
            Secure
          </span>
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-white/40 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
            <Lock className="h-3 w-3" />
            Restricted access
          </span>
        </div>
      </div>

      {/* ── Full-width visual + floating login card overlay ── */}
      <div className="relative flex-1 overflow-hidden">
        <VisualPanel />

        {/* Login card — floats over the right side of the panel */}
        <div className="relative z-20 flex h-full items-center justify-center px-6 py-10 lg:justify-end lg:pr-16 xl:pr-24">
          <div className="w-full max-w-[420px]">
            <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white shadow-[0_34px_80px_-24px_rgba(0,0,0,0.55)] p-8 sm:p-10">
              {/* Top accent bar */}
              <div
                className="absolute inset-x-0 top-0 h-[3px] rounded-t-[24px]"
                style={{ background: "linear-gradient(90deg, #7213EA 0%, #1E49E2 56%, #00B8F5 100%)" }}
              />

              <div className="mb-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#E2EBF8] bg-[#F3F7FF] px-3 py-1.5 mb-5">
                  <Cpu className="h-3.5 w-3.5 text-[#1E49E2]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1E49E2]">Apex workspace</span>
                </div>
                <h1 className="text-[36px] font-bold leading-none tracking-[-0.02em] text-[#0C233C]">Sign In</h1>
                <p className="mt-3 text-[14px] leading-6 text-[#5A6B82]">
                  Access your agentic controls environment. Authorised users only.
                </p>
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5A6B82]">
                    Username
                  </Label>
                  <Input
                    id="email"
                    type="text"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@bank.com"
                    required
                    className="h-12 rounded-[14px] border-[#D6E2F5] bg-[#F7FAFF] px-4 text-[15px] text-[#0C233C] placeholder:text-slate-400 focus:border-[#1E49E2] focus:ring-[#1E49E2]/20"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5A6B82]">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className="h-12 rounded-[14px] border-[#D6E2F5] bg-[#F7FAFF] px-4 text-[15px] text-[#0C233C] placeholder:text-slate-400 focus:border-[#1E49E2] focus:ring-[#1E49E2]/20"
                  />
                </div>

                {loginError && (
                  <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-2.5 text-sm text-red-600">{loginError}</p>
                )}

                <Button
                  type="submit"
                  disabled={loggingIn}
                  className="mt-1 h-12 w-full rounded-[14px] text-white text-[15px] font-semibold shadow-[0_12px_28px_-12px_rgba(30,73,226,0.55)]"
                  style={{ background: "linear-gradient(135deg, #1E49E2 0%, #00338D 100%)" }}
                >
                  {loggingIn ? "Signing in…" : "Sign In"}
                  {!loggingIn && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </form>

              <p className="mt-6 text-sm text-[#7A8FA8]">
                New user?{" "}
                <button
                  type="button"
                  className="font-semibold text-[#1E49E2] hover:text-[#00338D] transition-colors"
                  onClick={() => { setShowRegister(true); setRegError(""); }}
                >
                  Create an account
                </button>
              </p>
            </div>

            <p className="mt-6 text-center text-[11px] text-white/40">
              © 2026 KPMG India — Apex confidential · Unauthorised access is prohibited
            </p>
          </div>
        </div>
      </div>

      {/* ── Register dialog ── */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create an account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRegister} className="mt-2 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-name" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5A6B82]">Full name</Label>
              <Input id="reg-name" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Jane Smith" required className="h-12 rounded-[14px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-email" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5A6B82]">Email</Label>
              <Input id="reg-email" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="jane@example.com" required className="h-12 rounded-[14px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-password" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5A6B82]">Password</Label>
              <Input id="reg-password" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Min. 6 characters" required className="h-12 rounded-[14px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-confirm" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5A6B82]">Confirm password</Label>
              <Input id="reg-confirm" type="password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} placeholder="Repeat password" required className="h-12 rounded-[14px]" />
            </div>
            {regError && <p className="text-sm text-red-500">{regError}</p>}
            <Button type="submit" className="mt-1 h-12 w-full rounded-[14px]" disabled={registering}>
              {registering ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Footer />
    </div>
  );
}
