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
    desc: "Automated risk identification and control testing powered by Gemini",
  },
  {
    icon: Shield,
    title: "Regulatory Compliance",
    desc: "NIST CSF, ISO 27001, SOC2, PCI-DSS, GDPR, Basel III",
  },
  {
    icon: FileSearch,
    title: "Evidence-Based Control Testing",
    desc: "Upload and analyse evidence files against control frameworks",
  },
  {
    icon: ClipboardList,
    title: "AI-Powered Workpaper Generation",
    desc: "Generate audit-ready workpapers and executive summaries instantly",
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
    if (user) setLocation("/");
  }, [user, setLocation]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    const result = login(email.trim(), password);
    if (result.ok) {
      setLocation("/");
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
      setLocation("/");
    } else {
      setRegError(result.error ?? "Registration failed.");
    }
    setRegistering(false);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080E1F]">
      {/* Subtle grid pattern overlay */}
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
        <div className="w-full max-w-sm">
          {/* Glass card */}
          <div className="glass-light rounded-2xl p-8 flex flex-col items-center gap-6">
            {/* Logo avatar */}
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-white text-2xl font-bold select-none shadow-lg"
              style={{ background: "linear-gradient(135deg, #1B6CE8, #6B2EE0)" }}
            >
              TR
            </div>

            {/* Heading */}
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">Trace</h1>
              <p className="mt-1 text-sm text-slate-400">
                Trusted Risk Assurance &amp; Controls Engine
              </p>
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
                  className="bg-white/5 border-white/15 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
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
                  className="bg-white/5 border-white/15 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                />
              </div>

              {loginError && (
                <p className="text-sm text-red-400 text-center">{loginError}</p>
              )}

              <Button
                type="submit"
                disabled={loggingIn}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold border-0 shadow-lg"
              >
                {loggingIn ? "Signing in…" : "Sign In"}
              </Button>
            </form>

            {/* Register link */}
            <p className="text-sm text-slate-400">
              New user?{" "}
              <button
                type="button"
                className="text-blue-400 hover:text-blue-300 hover:underline font-medium transition-colors"
                onClick={() => { setShowRegister(true); setRegError(""); }}
              >
                Create an account
              </button>
            </p>

            {/* Demo credentials */}
            <div className="rounded-lg border border-blue-700/30 bg-blue-900/20 px-4 py-3 text-center w-full">
              <p className="text-xs font-medium text-blue-300 mb-1">Demo Credentials</p>
              <p className="text-xs text-slate-400">admin@bank.com / admin123</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel — KPMG gradient ── */}
      <div className="hidden md:flex md:w-[56%] flex-col justify-center px-16 relative overflow-hidden"
           style={{ background: "linear-gradient(135deg, #4C1D95 0%, #5B21B6 30%, #1D4ED8 70%, #1E40AF 100%)" }}>

        {/* Decorative blobs */}
        <div className="absolute top-[-80px] right-[-80px] h-64 w-64 rounded-full opacity-20"
             style={{ background: "radial-gradient(circle, #00E5FF, transparent)" }} />
        <div className="absolute bottom-[-60px] left-[-60px] h-48 w-48 rounded-full opacity-15"
             style={{ background: "radial-gradient(circle, #7C3AED, transparent)" }} />

        <div className="relative z-10">
          <h2 className="text-4xl font-extrabold text-white leading-tight mb-3">
            Enterprise-Grade<br />Cybersecurity Auditing
          </h2>
          <p className="text-blue-200 text-sm mb-10 font-medium">
            AI-powered. Compliance-ready. Audit-grade.
          </p>

          <ul className="flex flex-col gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-4 rounded-xl p-4"
                  style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{ background: "rgba(0,229,255,0.15)" }}>
                  <CheckCircle className="h-4 w-4 text-cyan-400" />
                </span>
                <div>
                  <p className="font-semibold text-white text-sm">{title}</p>
                  <p className="text-xs text-blue-200 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Register dialog ── */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="sm:max-w-md bg-[#0F1629] border-[#1E2D4D] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Create an account</DialogTitle>
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
              className="w-full bg-blue-600 hover:bg-blue-500 text-white border-0 mt-1"
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
