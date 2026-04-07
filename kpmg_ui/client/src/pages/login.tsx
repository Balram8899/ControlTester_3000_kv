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
import { CheckCircle, Shield, FileSearch, Brain, ClipboardList } from "lucide-react";

const FEATURES = [
  {
    icon: Brain,
    title: "Multi-Agent AI Assessment",
    desc: "Automated risk identification and control testing powered by AI Agents",
  },
  {
    icon: Shield,
    title: "Regulatory Compliance",
    desc: "NIST CSF, ISO 27001, SOC2, PCI-DSS, GDPR",
  },
  {
    icon: FileSearch,
    title: "Evidence-Based Control Testing",
    desc: "Upload and analyse evidence files against control frameworks",
  },
  {
    icon: ClipboardList,
    title: "AI-Powered Workpaper Generation",
    desc: "Generate workpapers and executive summaries instantly",
  },
];

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { user, login, register } = useAuth();

  // Login form state
  const [email, setEmail] = useState("admin@bank.com");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Register dialog state
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

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    const result = login(email.trim(), password);
    if (result.ok) {
      setLocation("/landing");
    } else {
      setLoginError(result.error ?? "Login failed.");
    }
    setLoggingIn(false);
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError("");
    if (!regName.trim()) { setRegError("Name is required."); return; }
    if (!regEmail.trim()) { setRegError("Email is required."); return; }
    if (regPassword.length < 6) { setRegError("Password must be at least 6 characters."); return; }
    if (regPassword !== regConfirm) { setRegError("Passwords do not match."); return; }
    setRegistering(true);
    const result = register(regName.trim(), regEmail.trim().toLowerCase(), regPassword);
    if (result.ok) {
      setShowRegister(false);
      setLocation("/landing");
    } else {
      setRegError(result.error ?? "Registration failed.");
    }
    setRegistering(false);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden osint-scanline" style={{ background: "var(--dark-blue)" }}>
      {/* Animated gradient orbs */}
      <div
        className="absolute top-[-100px] right-[20%] h-72 w-72 rounded-full opacity-25 blur-[80px] animate-orb-float"
        style={{ background: "radial-gradient(circle, var(--pacific), transparent)" }}
      />
      <div
        className="absolute bottom-[-80px] left-[10%] h-56 w-56 rounded-full opacity-20 blur-[70px] animate-orb-float"
        style={{ background: "radial-gradient(circle, var(--cobalt), transparent)", animationDelay: "-3s" }}
      />
      <div
        className="absolute top-[40%] left-[40%] h-40 w-40 rounded-full opacity-15 blur-[60px] animate-orb-float"
        style={{ background: "radial-gradient(circle, var(--purple-accent), transparent)", animationDelay: "-5s" }}
      />

      {/* OSINT dot grid overlay */}
      <div className="absolute inset-0 pointer-events-none osint-grid opacity-60" />

      {/* Subtle line grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* ── Left panel — glassmorphism form ── */}
      <div className="relative flex w-full md:w-[44%] items-center justify-center p-8">
        <div className="w-full max-w-sm animate-panel-in">
          {/* Glass card */}
          <div className="glass-light rounded-3xl p-8 flex flex-col items-center gap-6">
            {/* Logo */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-xl text-white text-lg font-bold font-mono select-none shadow-lg glow-border"
                style={{ background: "linear-gradient(135deg, var(--kpmg-blue), var(--cobalt))" }}
              >
                <span className="tracking-[0.15em]">TR</span>
              </div>
              <div className="text-center">
                <h1 className="text-xl font-bold font-mono text-white tracking-[0.2em] uppercase">Trace</h1>
                <p className="mt-1 text-[10px] text-slate-500 font-mono tracking-[0.15em] uppercase">
                  Control Testing Platform
                </p>
              </div>
            </div>

            {/* Login form */}
            <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-slate-300 text-xs font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="bg-white/5 border-white/15 text-white placeholder:text-slate-500 focus:border-[var(--pacific)] focus:ring-[var(--pacific)]/20"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-slate-300 text-xs font-medium">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-white/5 border-white/15 text-white placeholder:text-slate-500 focus:border-[var(--pacific)] focus:ring-[var(--pacific)]/20"
                />
              </div>

              {loginError && (
                <p className="text-sm text-red-400 text-center">{loginError}</p>
              )}

              <Button
                type="submit"
                disabled={loggingIn}
                className="w-full bg-[var(--kpmg-blue)] hover:bg-[var(--cobalt)] text-white font-semibold border-0 shadow-lg transition-all duration-200"
              >
                {loggingIn ? "Signing in…" : "Sign In"}
              </Button>
            </form>

            {/* Register link */}
            <p className="text-sm text-slate-400">
              New user?{" "}
              <button
                type="button"
                className="text-[var(--pacific)] hover:text-[var(--pacific)]/80 hover:underline font-medium transition-colors"
                onClick={() => { setShowRegister(true); setRegError(""); }}
              >
                Create an account
              </button>
            </p>

            {/* Demo credentials */}
            <div className="rounded-lg border border-[var(--cobalt)]/30 bg-[var(--cobalt)]/10 px-4 py-3 text-center w-full">
              <p className="text-xs font-medium text-[var(--pacific)] mb-1">Demo Credentials</p>
              <p className="text-xs text-slate-400">admin@bank.com / admin123</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel — KPMG gradient ── */}
      <div className="hidden md:flex md:w-[56%] flex-col justify-center px-16 relative overflow-hidden"
           style={{ background: "linear-gradient(135deg, var(--dark-blue) 0%, var(--kpmg-blue) 100%)" }}>

        {/* Decorative orbs */}
        <div className="absolute top-[-80px] right-[-80px] h-64 w-64 rounded-full opacity-20 blur-[60px] animate-orb-float"
             style={{ background: "radial-gradient(circle, var(--pacific), transparent)" }} />
        <div className="absolute bottom-[-60px] left-[-60px] h-48 w-48 rounded-full opacity-15 blur-[50px] animate-orb-float"
             style={{ background: "radial-gradient(circle, var(--purple-accent), transparent)", animationDelay: "-4s" }} />

        <div className="relative z-10">
          <h2 className="text-4xl font-extrabold font-display text-white leading-tight mb-3">
            Enterprise-Grade<br />Cybersecurity Auditing
          </h2>
          <p className="text-[var(--pacific)]/80 text-sm mb-10 text-white font-medium">
            AI-powered. Compliance-ready.
          </p>

          <ul className="flex flex-col gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <li key={title}
                  className="flex items-start gap-4 rounded-xl p-4 animate-fade-up"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    animationDelay: `${i * 0.1}s`,
                  }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{ background: "rgba(0,184,245,0.15)" }}>
                  <CheckCircle className="h-4 w-4 text-[var(--pacific)]" />
                </span>
                <div>
                  <p className="font-semibold font-display text-white text-sm">{title}</p>
                  <p className="text-xs text-blue-200 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Register dialog ── */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="sm:max-w-md border-[var(--cobalt)]/30 text-white" style={{ background: "var(--dark-blue)" }}>
          <DialogHeader>
            <DialogTitle className="text-white font-display">Create an account</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRegister} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-name" className="text-slate-300 text-xs">Full name</Label>
              <Input
                id="reg-name"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Jane Smith"
                required
                className="bg-white/5 border-white/15 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-email" className="text-slate-300 text-xs">Email</Label>
              <Input
                id="reg-email"
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="jane@example.com"
                required
                className="bg-white/5 border-white/15 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-password" className="text-slate-300 text-xs">Password</Label>
              <Input
                id="reg-password"
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                className="bg-white/5 border-white/15 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-confirm" className="text-slate-300 text-xs">Confirm password</Label>
              <Input
                id="reg-confirm"
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Repeat password"
                required
                className="bg-white/5 border-white/15 text-white placeholder:text-slate-500"
              />
            </div>

            {regError && (
              <p className="text-sm text-red-400">{regError}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-[var(--kpmg-blue)] hover:bg-[var(--cobalt)] text-white border-0 mt-1 transition-all duration-200"
              disabled={registering}
            >
              {registering ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
