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
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { ArrowRight } from "lucide-react";
import logo from "@/assets/kpmg (1).png";

const LOGIN_BACKGROUND_ANIMATION_SRC = "/pkg-background.lottie";

function LoginBackdrop() {
  return (
    <div
      className="login-backdrop pointer-events-none absolute inset-0 overflow-hidden bg-[#0C233C]"
      aria-hidden="true"
    >
      <DotLottieReact
        src={LOGIN_BACKGROUND_ANIMATION_SRC}
        autoplay
        loop
        layout={{ fit: "cover", align: [0.46, 0.5] }}
        renderConfig={{ autoResize: true }}
        className="login-background-canvas absolute left-[-8%] top-1/2 h-[112%] w-[116%] -translate-y-1/2 opacity-100"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,20,48,0.42)_0%,rgba(13,38,89,0.18)_45%,rgba(33,57,167,0.2)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(172,234,255,0.08)_0%,transparent_36%)]" />
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
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0C233C] px-4 py-8 sm:px-6"
    >
      <LoginBackdrop />

      <section className="login-centered-panel relative z-10 w-full max-w-[420px] overflow-hidden rounded-[20px] border border-white/60 bg-white/95 p-6 shadow-[0_28px_72px_-40px_rgba(0,0,0,0.72)] backdrop-blur-md sm:p-7">
          <div className="mb-6 flex justify-center">
            <div className="flex h-11 items-center rounded-[10px] border border-[#00338D]/10 bg-white px-3 shadow-[0_12px_24px_-22px_rgba(12,35,60,0.36)]">
              <img src={logo} alt="KPMG" className="h-6 w-auto object-contain" />
            </div>
          </div>

          <div className="mb-6">
            <h1 className="font-display text-[42px] font-bold leading-none text-[#0C233C]">Sign in</h1>
            <p className="mt-3 max-w-[320px] text-[14px] leading-6 text-[#5B6B82]">
              Technology risk assessment, control testing, and reporting platform.
            </p>
            <p className="text-[14px] leading-6 text-[#5B6B82]">Authorised users only.</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[12px] font-semibold text-[#35506D]">
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
                className="h-12 rounded-[12px] border border-[#00338D]/12 bg-[#F3F7FC] px-4 text-[15px] text-[#0C233C] placeholder:text-slate-500 focus:border-[#1E49E2] focus:ring-[#1E49E2]/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[12px] font-semibold text-[#35506D]">
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
                className="h-12 rounded-[12px] border border-[#00338D]/12 bg-[#F3F7FC] px-4 text-[15px] text-[#0C233C] placeholder:text-slate-500 focus:border-[#1E49E2] focus:ring-[#1E49E2]/20"
              />
            </div>

            {loginError && <p className="text-sm text-[#FF9AA8]">{loginError}</p>}

            <Button
              type="submit"
              disabled={loggingIn}
              className="mt-1 h-12 w-full rounded-[12px] bg-[#00338D] text-[15px] font-semibold text-white shadow-[0_18px_34px_-24px_rgba(23,68,163,0.9)] hover:bg-[#1E49E2]"
            >
              {loggingIn ? "Signing in..." : "Sign in"}
              {!loggingIn && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-5 text-sm text-[#5B6B82]">
            New user?{" "}
            <button
              type="button"
              className="font-semibold text-[#00338D] transition-colors hover:text-[#1E49E2]"
              onClick={() => {
                setShowRegister(true);
                setRegError("");
              }}
            >
              Create an account
            </button>
          </p>

          <p className="mt-6 text-center text-[11px] leading-5 text-[#7B8DA2]">
            @ 2026 KPMG India - TRACE confidential
            <br />
            Unauthorised access is prohibited.
          </p>
      </section>

      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="sm:max-w-md rounded-lg border-white/10 bg-[#0C233C] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Create an account</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRegister} className="mt-2 flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-name" className="text-[12px] font-semibold text-[#A9C3E7]">
                      Full name
                    </Label>
                    <Input
                      id="reg-name"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Jane Smith"
                      required
                      className="h-12 rounded-md border border-white/10 bg-[#E7EEF9] text-[#0C233C] placeholder:text-slate-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-email" className="text-[12px] font-semibold text-[#A9C3E7]">
                      Email
                    </Label>
                    <Input
                      id="reg-email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="jane@example.com"
                      required
                      className="h-12 rounded-md border border-white/10 bg-[#E7EEF9] text-[#0C233C] placeholder:text-slate-500"
                    />
                  </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-password" className="text-[12px] font-semibold text-[#A9C3E7]">
                Password
              </Label>
              <Input
                id="reg-password"
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                className="h-12 rounded-md border border-white/10 bg-[#E7EEF9] text-[#0C233C] placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-confirm" className="text-[12px] font-semibold text-[#A9C3E7]">
                Confirm password
              </Label>
              <Input
                id="reg-confirm"
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Repeat password"
                required
                className="h-12 rounded-md border border-white/10 bg-[#E7EEF9] text-[#0C233C] placeholder:text-slate-500"
              />
            </div>

            {regError && <p className="text-sm text-[#FF9AA8]">{regError}</p>}

            <Button
              type="submit"
              className="mt-1 h-12 w-full rounded-md bg-[#00338D] hover:bg-[#1E49E2] text-white border-0"
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
