import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, Lock, TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/lib/i18n";
import api, { setToken, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Layout";
import { CoinIcon } from "@/components/common";

function PromoPanel() {
  const rows = [
    { iso: "BTC", change: "+2.8%", up: true },
    { iso: "TRX", change: "+1.1%", up: true },
    { iso: "ETH", change: "+1.6%", up: true },
    { iso: "LTC", change: "-0.5%", up: false },
  ];
  return (
    <div className="relative hidden flex-1 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#0D5C46] via-[#0f6b50] to-[#063d2e] p-10 lg:flex">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative flex w-full flex-col justify-between">
        <div>
          <h2 className="max-w-sm text-3xl font-extrabold leading-tight text-white font-display">
            Статистика ваших балансів
          </h2>
          <p className="mt-3 max-w-sm text-sm text-emerald-100/80">
            Прийом, обмін і виведення криптовалюти в одному кабінеті. Приєднуйтесь до спільноти FozPay вже сьогодні!
          </p>
        </div>

        <div className="relative my-8 space-y-3">
          <div className="absolute -left-4 -top-6 rounded-2xl bg-white px-5 py-3 shadow-2xl rotate-[-4deg]">
            <div className="text-[11px] font-semibold text-slate-400">Personal</div>
            <div className="text-xl font-extrabold text-slate-900">$720.00</div>
          </div>
          <div className="ml-auto w-max rounded-2xl bg-white px-5 py-3 shadow-2xl rotate-[3deg]">
            <div className="text-[11px] font-semibold text-slate-400">Business</div>
            <div className="text-xl font-extrabold text-slate-900">$1 240.00</div>
          </div>
          <div className="mt-10 space-y-2 rounded-3xl bg-white/95 p-4 shadow-2xl backdrop-blur foz-float">
            {rows.map((r) => (
              <div key={r.iso} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-2.5">
                <CoinIcon iso={r.iso} size={30} />
                <div className="flex-1 font-semibold text-slate-800">{r.iso}</div>
                <div className={`flex items-center gap-1 text-sm font-bold ${r.up ? "text-emerald-600" : "text-rose-500"}`}>
                  <TrendingUp className={`h-3.5 w-3.5 ${r.up ? "" : "rotate-180"}`} />{r.change}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-2xl font-extrabold text-white/90 font-display">
          Join to FozPay<br />community now!
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { setUser } = useAuth();
  const { t, lang, setLang } = useLang();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needs2FA, setNeeds2FA] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login");
  const [regName, setRegName] = useState("");
  const [regEnabled, setRegEnabled] = useState(false);

  useEffect(() => {
    api.get("/auth/registration-status").then((r) => setRegEnabled(!!r.data.enabled)).catch(() => {});
  }, []);

  const doRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/register", { email, password, name: regName });
      setToken(data.access_token);
      setUser && setUser(data.user);
      if (data.pending) {
        toast.success(t("reg_pending_toast"));
      }
      navigate("/dashboard");
    } catch (err) { toast.error(apiErr(err)); }
    finally { setBusy(false); }
  };

  const doLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { email, password, otp: otp || undefined });
      setToken(data.access_token);
      setUser && setUser(data.user);
      navigate("/dashboard");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === "object" && (detail.error === "2FA_REQUIRED" || detail.error === "2FA_INVALID")) {
        setNeeds2FA(true);
        toast.info(detail.message || "Введіть код Google Authenticator");
      } else {
        toast.error(apiErr(err));
      }
    } finally { setBusy(false); }
  };

  const google = () => {
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="relative min-h-screen bg-slate-50 p-3 sm:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-6xl gap-5">
        {/* Left: form */}
        <div className="flex flex-1 flex-col rounded-[2.5rem] bg-white p-7 shadow-sm sm:p-10">
          <div className="flex items-center justify-between">
            <Logo size="text-2xl" />
            <button onClick={() => setLang(lang === "uk" ? "en" : "uk")} data-testid="login-lang"
              className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <span>{lang === "uk" ? "🇺🇦" : "🇬🇧"}</span>{lang === "uk" ? "Українська" : "English"}
            </button>
          </div>

          <div className="flex flex-1 flex-col justify-center py-8">
            <div className="mx-auto w-full max-w-sm oki-fade-up">
              <h1 className="text-3xl font-extrabold text-slate-900 font-display">
                {mode === "login" ? t("cabinet_login_title") : t("signup")}
              </h1>
              <p className="mt-2 mb-7 text-sm text-slate-500">{t("login_sub")}</p>

              <form onSubmit={mode === "login" ? doLogin : doRegister} className="space-y-4">
                {mode === "register" && (
                  <div>
                    <Label>{t("name")}</Label>
                    <Input data-testid="reg-name" value={regName} onChange={(e) => setRegName(e.target.value)} className="mt-1 h-12 rounded-2xl" placeholder="Ім'я" />
                  </div>
                )}
                <div>
                  <Label>{t("email")}</Label>
                  <Input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-12 rounded-2xl" placeholder="admin@fozpay.io" />
                </div>
                <div>
                  <Label>{t("password")}</Label>
                  <Input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-12 rounded-2xl" placeholder="••••••••" />
                </div>
                {needs2FA && (
                  <div>
                    <Label className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Код Google Authenticator</Label>
                    <Input data-testid="login-otp" value={otp} onChange={(e) => setOtp(e.target.value)} className="mt-1 h-12 rounded-2xl tracking-widest text-center" placeholder="123 456" inputMode="numeric" maxLength={6} autoFocus />
                  </div>
                )}
                <Button data-testid="login-submit" disabled={busy} className="btn-foz h-12 w-full rounded-2xl text-base font-bold">
                  {busy ? "..." : mode === "login" ? t("login_btn") : t("register_btn")}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                <div className="h-px flex-1 bg-slate-200" /> OR <div className="h-px flex-1 bg-slate-200" />
              </div>
              <Button data-testid="google-login" onClick={google} variant="outline" className="h-12 w-full rounded-2xl border-slate-200">
                <img alt="g" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="mr-2 h-4 w-4" />
                {t("google_btn")}
              </Button>

              <div className="mt-6 text-center text-xs text-slate-500">
                {regEnabled ? (
                  <button type="button" data-testid="toggle-auth-mode" onClick={() => setMode(mode === "login" ? "register" : "login")}
                    className="font-semibold text-[#0D5C46] hover:underline">
                    {mode === "login" ? t("no_account") : t("have_account")}
                  </button>
                ) : (
                  <span className="inline-flex items-center justify-center gap-2"><Lock className="h-3.5 w-3.5" /> {t("reg_closed")}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: promo */}
        <PromoPanel />
      </div>
    </div>
  );
}
