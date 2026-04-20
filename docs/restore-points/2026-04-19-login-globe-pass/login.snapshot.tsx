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
import { ArrowRight, CheckCircle2, Brain } from "lucide-react";
import logo from "@/assets/kpmg (1).png";

const VALUE_POINTS = [
  "Regulatory comparison and library operations",
  "Evidence-led control testing and validation",
  "Structured reporting and workpaper generation",
];

const GLOBE_POINTS = [
  { top: "14%", left: "60%", size: 10, delay: "0s" },
  { top: "19%", left: "47%", size: 7, delay: "0.2s" },
  { top: "25%", left: "70%", size: 9, delay: "0.4s" },
  { top: "29%", left: "37%", size: 6, delay: "0.1s" },
  { top: "33%", left: "58%", size: 8, delay: "0.6s" },
  { top: "38%", left: "67%", size: 7, delay: "0.3s" },
  { top: "42%", left: "49%", size: 11, delay: "0.7s" },
  { top: "47%", left: "74%", size: 8, delay: "0.5s" },
  { top: "50%", left: "35%", size: 6, delay: "0.15s" },
  { top: "55%", left: "57%", size: 10, delay: "0.4s" },
  { top: "59%", left: "67%", size: 7, delay: "0.75s" },
  { top: "63%", left: "43%", size: 8, delay: "0.25s" },
  { top: "68%", left: "59%", size: 9, delay: "0.55s" },
  { top: "72%", left: "74%", size: 6, delay: "0.35s" },
  { top: "77%", left: "51%", size: 9, delay: "0.65s" },
];

function GlobeBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 78% 42%, rgba(115, 61, 255, 0.35), transparent 22%), radial-gradient(circle at 68% 58%, rgba(0, 184, 245, 0.18), transparent 28%)",
        }}
      />

      <div className="absolute inset-0 opacity-[0.08]" style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
        backgroundSize: "68px 68px",
      }} />

      <div className="absolute right-[-8%] top-1/2 hidden h-[700px] w-[700px] -translate-y-1/2 md:block lg:right-[2%]">
        <div
          className="absolute inset-0 rounded-full opacity-95"
          style={{
            animation: "kpmg-globe-spin 46s linear infinite",
            background:
              "radial-gradient(circle at 45% 42%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.12) 14%, rgba(30,73,226,0.12) 30%, rgba(0,51,141,0.05) 64%, transparent 72%)",
            filter: "blur(1px)",
          }}
        />

        <div
          className="absolute inset-[6%] rounded-full"
          style={{
            boxShadow:
              "0 0 80px rgba(103, 99, 255, 0.35), 0 0 160px rgba(0, 184, 245, 0.12)",
            border: "1px solid rgba(255,255,255,0.14)",
            background:
              "radial-gradient(circle at 42% 40%, rgba(255,255,255,0.22), rgba(255,255,255,0.02) 24%, rgba(30,73,226,0.08) 52%, rgba(77,36,255,0.24) 76%, rgba(131,79,255,0.34) 100%)",
            overflow: "hidden",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, transparent 0 44%, rgba(255,255,255,0.08) 44.5%, transparent 45%), radial-gradient(circle at 50% 50%, transparent 0 58%, rgba(255,255,255,0.08) 58.5%, transparent 59%), radial-gradient(circle at 50% 50%, transparent 0 72%, rgba(255,255,255,0.07) 72.5%, transparent 73%)",
            }}
          />

          <div className="absolute inset-y-[10%] left-1/2 w-[16%] -translate-x-1/2 rounded-full border border-white/10" />
          <div className="absolute inset-y-[7%] left-1/2 w-[34%] -translate-x-1/2 rounded-full border border-white/10" />
          <div className="absolute inset-y-[4%] left-1/2 w-[56%] -translate-x-1/2 rounded-full border border-white/10" />
          <div className="absolute inset-y-[1%] left-1/2 w-[80%] -translate-x-1/2 rounded-full border border-white/10" />

          <div className="absolute inset-x-[8%] top-[18%] h-[18%] rounded-full border border-white/10" />
          <div className="absolute inset-x-[5%] top-[34%] h-[14%] rounded-full border border-white/10" />
          <div className="absolute inset-x-[4%] top-[48%] h-[10%] rounded-full border border-white/10" />
          <div className="absolute inset-x-[5%] top-[58%] h-[14%] rounded-full border border-white/10" />
          <div className="absolute inset-x-[8%] top-[70%] h-[18%] rounded-full border border-white/10" />

          <div
            className="absolute inset-0 opacity-80"
            style={{
              backgroundImage:
                "linear-gradient(115deg, transparent 22%, rgba(255,255,255,0.12) 24%, transparent 26%), linear-gradient(38deg, transparent 40%, rgba(255,255,255,0.08) 42%, transparent 44%), linear-gradient(145deg, transparent 64%, rgba(255,255,255,0.09) 66%, transparent 68%)",
              animation: "kpmg-globe-spin-reverse 60s linear infinite",
            }}
          />

          {GLOBE_POINTS.map((point, index) => (
            <span
              key={index}
              className="absolute rounded-full bg-white animate-pulse"
              style={{
                top: point.top,
                left: point.left,
                width: point.size,
                height: point.size,
                animationDelay: point.delay,
                boxShadow: "0 0 16px rgba(255,255,255,0.95), 0 0 28px rgba(103,99,255,0.6)",
              }}
            />
          ))}
        </div>
      </div>

      <div className="absolute right-[-20%] top-[12%] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.22),transparent_72%)] blur-3xl opacity-40 md:right-[12%]" />
      <div className="absolute bottom-[-10%] right-[8%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(131,79,255,0.26),transparent_70%)] blur-3xl opacity-35" />
    </div>
  );
}

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
    if (!regName.trim()) {
      setRegError("Name is required.");
      return;
    }
    if (!regEmail.trim()) {
      setRegError("Email is required.");
      return;
    }
    if (regPassword.length < 6) {
      setRegError("Password must be at least 6 characters.");
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError("Passwords do not match.");
      return;
    }
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
    <div
      className="relative flex min-h-screen w-screen overflow-hidden"
      style={{
        background:
          "linear-gradient(115deg, #081a2f 0%, #0c233c 18%, #00338d 62%, #4a35d9 100%)",
      }}
    >
      <GlobeBackdrop />

      <div className="relative z-10 flex w-full flex-col px-6 py-8 md:px-10 lg:px-14">
        <div className="flex items-center gap-4">
          <div className="flex h-12 items-center rounded-[18px] bg-white px-3 shadow-[0_18px_36px_-30px_rgba(0,0,0,0.45)]">
            <img src={logo} alt="KPMG" className="h-7 w-auto object-contain" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-white/72">TRACE workspace</p>
            <p className="mt-1 text-[13px] font-semibold text-white">Enterprise control platform</p>
          </div>
        </div>

        <div className="flex flex-1 items-center">
          <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1.05fr)_420px] lg:items-center">
            <div className="max-w-2xl pt-8 lg:pt-0">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-3 py-1.5">
                <Brain className="h-3.5 w-3.5 text-[#ACEAFF]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/84">
                  Centralized access
                </span>
              </div>

              <h1 className="max-w-3xl text-[42px] font-bold leading-[1.02] tracking-[-0.02em] text-white sm:text-[54px]">
                Sign in to TRACE and operate from a single control, testing, and reporting workspace.
              </h1>

              <p className="mt-6 max-w-xl text-[15px] leading-7 text-white/78">
                Access regulatory analysis, evidence validation, control testing, and structured reporting through a
                unified enterprise platform.
              </p>

              <div className="mt-8 flex flex-col gap-3">
                {VALUE_POINTS.map((point) => (
                  <div key={point} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/16 bg-white/10">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#ACEAFF]" />
                    </span>
                    <p className="text-[14px] leading-6 text-white/82">{point}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full max-w-md lg:ml-auto">
              <div className="rounded-[28px] border border-white/18 bg-white/96 p-7 shadow-[0_28px_72px_-36px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#5B6B82]">Secure sign in</p>
                  <h2 className="mt-2 text-[28px] font-bold leading-tight text-[#0C233C]">Enter your workspace</h2>
                  <p className="mt-2 text-[13px] leading-6 text-slate-500">
                    Use your TRACE credentials to continue into the control platform.
                  </p>
                </div>

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email" className="text-[#0C233C] text-xs font-semibold">
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
                      className="h-11 border-[#D7E0EE] bg-white text-[#0C233C] placeholder:text-slate-400 focus:border-[#1E49E2] focus:ring-[#1E49E2]/15"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password" className="text-[#0C233C] text-xs font-semibold">
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
                      className="h-11 border-[#D7E0EE] bg-white text-[#0C233C] placeholder:text-slate-400 focus:border-[#1E49E2] focus:ring-[#1E49E2]/15"
                    />
                  </div>

                  {loginError && <p className="text-sm text-[#E5001B]">{loginError}</p>}

                  <Button
                    type="submit"
                    disabled={loggingIn}
                    className="mt-1 h-11 w-full rounded-full bg-[#00338D] hover:bg-[#1E49E2] text-white font-semibold shadow-[0_18px_34px_-24px_rgba(0,51,141,0.65)]"
                  >
                    {loggingIn ? "Signing in..." : "Sign In"}
                    {!loggingIn && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                </form>

                <div className="mt-5 rounded-2xl border border-[#D9E4F5] bg-[#F6F9FD] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1E49E2]">Demo credentials</p>
                  <p className="mt-1 text-[13px] text-slate-600">admin@bank.com / admin123</p>
                </div>

                <p className="mt-5 text-sm text-slate-500">
                  New user?{" "}
                  <button
                    type="button"
                    className="font-semibold text-[#00338D] hover:text-[#1E49E2] transition-colors"
                    onClick={() => {
                      setShowRegister(true);
                      setRegError("");
                    }}
                  >
                    Create an account
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="sm:max-w-md border-[#D9E4F5] bg-white text-[#0C233C]">
          <DialogHeader>
            <DialogTitle className="text-[#0C233C]">Create an account</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRegister} className="mt-2 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-name" className="text-xs font-semibold text-[#0C233C]">
                Full name
              </Label>
              <Input
                id="reg-name"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Jane Smith"
                required
                className="border-[#D7E0EE] bg-white text-[#0C233C] placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-email" className="text-xs font-semibold text-[#0C233C]">
                Email
              </Label>
              <Input
                id="reg-email"
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="jane@example.com"
                required
                className="border-[#D7E0EE] bg-white text-[#0C233C] placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-password" className="text-xs font-semibold text-[#0C233C]">
                Password
              </Label>
              <Input
                id="reg-password"
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                className="border-[#D7E0EE] bg-white text-[#0C233C] placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-confirm" className="text-xs font-semibold text-[#0C233C]">
                Confirm password
              </Label>
              <Input
                id="reg-confirm"
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Repeat password"
                required
                className="border-[#D7E0EE] bg-white text-[#0C233C] placeholder:text-slate-400"
              />
            </div>

            {regError && <p className="text-sm text-[#E5001B]">{regError}</p>}

            <Button
              type="submit"
              className="mt-1 w-full rounded-full bg-[#00338D] hover:bg-[#1E49E2] text-white border-0"
              disabled={registering}
            >
              {registering ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
