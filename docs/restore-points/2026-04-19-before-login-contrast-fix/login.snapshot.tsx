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
import { ArrowRight } from "lucide-react";
import logo from "@/assets/kpmg (1).png";

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
            "radial-gradient(circle at 78% 28%, rgba(122, 91, 255, 0.36), transparent 22%), radial-gradient(circle at 88% 56%, rgba(179, 115, 255, 0.24), transparent 20%), radial-gradient(circle at 62% 52%, rgba(0, 184, 245, 0.12), transparent 26%)",
        }}
      />

      <div className="absolute right-[-18%] top-1/2 hidden h-[780px] w-[780px] -translate-y-1/2 md:block lg:right-[-2%]">
        <div
          className="absolute inset-0 rounded-full opacity-95"
          style={{
            animation: "kpmg-globe-spin 46s linear infinite",
            background:
              "radial-gradient(circle at 45% 42%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.12) 14%, rgba(97,103,255,0.16) 30%, rgba(63,44,163,0.08) 64%, transparent 72%)",
            filter: "blur(1px)",
          }}
        />

        <div
          className="absolute inset-[6%] rounded-full"
          style={{
            boxShadow:
              "0 0 80px rgba(119, 99, 255, 0.4), 0 0 170px rgba(166, 107, 255, 0.18)",
            border: "1px solid rgba(255,255,255,0.14)",
            background:
              "radial-gradient(circle at 42% 40%, rgba(255,255,255,0.22), rgba(255,255,255,0.02) 24%, rgba(89,101,255,0.12) 52%, rgba(95,54,255,0.26) 76%, rgba(172,109,255,0.32) 100%)",
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

      <div className="absolute left-[-10%] top-[18%] h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_72%)] blur-3xl opacity-40" />
      <div className="absolute right-[-12%] top-[8%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(169,126,255,0.18),transparent_68%)] blur-3xl opacity-45" />
      <div className="absolute bottom-[-12%] right-[10%] h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(122,85,255,0.22),transparent_70%)] blur-3xl opacity-45" />
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
      className="relative flex min-h-screen w-screen items-center justify-center overflow-hidden px-6 py-8"
      style={{
        background:
          "linear-gradient(112deg, #0a1b31 0%, #102b4a 34%, #173c88 68%, #4c42d3 100%)",
      }}
    >
      <GlobeBackdrop />

      <div className="relative z-10 w-full max-w-[560px]">
        <div className="rounded-[30px] border border-white/10 bg-[#172c49]/88 p-8 shadow-[0_34px_80px_-34px_rgba(0,0,0,0.72)] backdrop-blur-[18px] sm:p-10">
          <div className="mb-10 flex items-center gap-4">
            <div className="flex h-12 items-center rounded-[16px] bg-white px-3.5 shadow-[0_18px_36px_-30px_rgba(0,0,0,0.55)]">
              <img src={logo} alt="KPMG" className="h-7 w-auto object-contain" />
            </div>
            <div className="h-8 w-px bg-white/14" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#7FD2FF]">TRACE</p>
              <p className="mt-1 text-[12px] font-medium text-white/54">Restricted workspace</p>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-[44px] font-bold leading-none tracking-[-0.03em] text-white">Sign In</h1>
            <p className="mt-4 max-w-[360px] text-[15px] leading-7 text-white/58">
              Technology risk assessment, control testing, and reporting platform.
            </p>
            <p className="text-[15px] leading-7 text-white/58">Authorised users only.</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/56">
                Username
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@bank.com"
                required
                className="h-14 rounded-2xl border border-white/10 bg-[#E7EEF9] px-5 text-[16px] text-[#0C233C] placeholder:text-slate-500 focus:border-[#7C8DFF] focus:ring-[#7C8DFF]/25"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/56">
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
                className="h-14 rounded-2xl border border-white/10 bg-[#E7EEF9] px-5 text-[16px] text-[#0C233C] placeholder:text-slate-500 focus:border-[#7C8DFF] focus:ring-[#7C8DFF]/25"
              />
            </div>

            {loginError && <p className="text-sm text-[#FF9AA8]">{loginError}</p>}

            <Button
              type="submit"
              disabled={loggingIn}
              className="mt-2 h-14 w-full rounded-2xl bg-[#1744A3] hover:bg-[#2552BE] text-white text-[16px] font-semibold shadow-[0_20px_38px_-24px_rgba(23,68,163,0.9)]"
            >
              {loggingIn ? "Signing in..." : "Sign In"}
              {!loggingIn && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-8 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#7FD2FF]">Demo credentials</p>
            <p className="mt-1 text-[13px] text-white/70">admin@bank.com / admin123</p>
          </div>

          <p className="mt-6 text-sm text-white/52">
            New user?{" "}
            <button
              type="button"
              className="font-semibold text-white hover:text-[#7FD2FF] transition-colors"
              onClick={() => {
                setShowRegister(true);
                setRegError("");
              }}
            >
              Create an account
            </button>
          </p>

          <p className="mt-10 text-center text-[12px] leading-6 text-white/28">
            © 2026 KPMG LLP · TRACE confidential
            <br />
            Unauthorised access is prohibited.
          </p>
        </div>
      </div>

      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="sm:max-w-md border-white/10 bg-[#172c49] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Create an account</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRegister} className="mt-2 flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-name" className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/56">
                      Full name
                    </Label>
                    <Input
                      id="reg-name"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Jane Smith"
                      required
                      className="h-12 rounded-2xl border border-white/10 bg-[#E7EEF9] text-[#0C233C] placeholder:text-slate-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-email" className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/56">
                      Email
                    </Label>
                    <Input
                      id="reg-email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="jane@example.com"
                      required
                      className="h-12 rounded-2xl border border-white/10 bg-[#E7EEF9] text-[#0C233C] placeholder:text-slate-500"
                    />
                  </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-password" className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/56">
                Password
              </Label>
              <Input
                id="reg-password"
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                className="h-12 rounded-2xl border border-white/10 bg-[#E7EEF9] text-[#0C233C] placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-confirm" className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/56">
                Confirm password
              </Label>
              <Input
                id="reg-confirm"
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Repeat password"
                required
                className="h-12 rounded-2xl border border-white/10 bg-[#E7EEF9] text-[#0C233C] placeholder:text-slate-500"
              />
            </div>

            {regError && <p className="text-sm text-[#FF9AA8]">{regError}</p>}

            <Button
              type="submit"
              className="mt-1 h-12 w-full rounded-2xl bg-[#1744A3] hover:bg-[#2552BE] text-white border-0"
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
