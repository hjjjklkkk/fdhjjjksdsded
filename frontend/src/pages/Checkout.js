import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Copy, CheckCircle2, X, ExternalLink, HelpCircle, Hourglass } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { CoinIcon, fmtCrypto } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Layout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Circular countdown ring for the "rate valid for" timer.
function RateRing({ left, total }) {
  const R = 11, C = 2 * Math.PI * R;
  const frac = total ? Math.max(0, left / total) : 0;
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0 -rotate-90">
      <circle cx="13" cy="13" r={R} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle cx="13" cy="13" r={R} fill="none" stroke="#10B981" strokeWidth="3"
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
    </svg>
  );
}

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang, setLang } = useLang();
  const [inv, setInv] = useState(null);
  const [meta, setMeta] = useState({ cur: {}, net: {} });
  const [pay, setPay] = useState(null);
  const [iso, setIso] = useState("");
  const [net, setNet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const RATE_WINDOW = 120; // seconds the quoted rate stays valid
  const [rateStart, setRateStart] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/checkout/${id}`);
      setInv(data.data);
      setMeta({ cur: data.data.currency_meta, net: data.data.network_meta });
      if (data.data.pay_info) setPay(data.data.pay_info);
    } catch (e) { toast.error(apiErr(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (inv && (inv.status === "Paid" || inv.status === "Completed")) return;
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [inv, load]);

  // 1-second ticker for both countdowns
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // group accepted (iso, network) pairs into iso -> [network_ids]
  const isoMap = useMemo(() => {
    const m = {};
    (inv?.currencies || []).forEach((c) => {
      (m[c.iso] = m[c.iso] || []).push(c.network);
    });
    return m;
  }, [inv]);
  const isoList = Object.keys(isoMap);

  useEffect(() => {
    if (!iso && isoList.length) {
      const first = isoList.includes("USDT") ? "USDT" : isoList[0];
      setIso(first);
    }
  }, [isoList, iso]);
  useEffect(() => {
    if (iso && isoMap[iso] && (net == null || !isoMap[iso].includes(net))) {
      setNet(isoMap[iso][0]);
    }
  }, [iso, isoMap, net]);

  const rateLeft = Math.max(0, RATE_WINDOW - Math.floor((now - rateStart) / 1000));
  useEffect(() => { if (rateLeft === 0) { setRateStart(Date.now()); load(); } }, [rateLeft, load]);

  const select = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/checkout/${id}/select`, { iso, network_id: net }); setPay(data.data); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  if (!inv) return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-400">…</div>;
  const paid = inv.status === "Paid" || inv.status === "Completed";
  const close = () => { if (inv.redirect_url) window.location.href = inv.redirect_url; else navigate("/"); };
  const expiryLeft = inv.time_expired ? inv.time_expired - Math.floor(now / 1000) : null;
  const usdApprox = pay ? pay.amount_to_pay : inv.price;

  const bestNet = (nid) => String(nid) === String(isoMap[iso]?.[0]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="oki-fade-up w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-xl sm:p-9">
        {/* header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {inv.merchant?.logo_url ? (
              <img data-testid="checkout-merchant-logo" src={inv.merchant.logo_url} alt={inv.merchant?.name || "merchant"}
                className="h-9 w-9 rounded-xl border border-slate-200 bg-white object-contain p-1" />
            ) : inv.merchant?.name ? (
              <div data-testid="checkout-merchant-initial" className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{ background: inv.merchant?.brand_color || "#0D5C46" }}>
                {inv.merchant.name.charAt(0).toUpperCase()}
              </div>
            ) : null}
            {inv.merchant?.name ? (
              <div className="leading-tight">
                <div data-testid="checkout-merchant-name" className="text-sm font-bold text-slate-900">{inv.merchant.name}</div>
                <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400">powered by <Logo size="text-[11px]" /></div>
              </div>
            ) : (
              <Logo size="text-2xl" />
            )}
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <button className="rounded-full p-1.5 hover:bg-slate-100" title="Довідка"><HelpCircle className="h-5 w-5" /></button>
            <button onClick={() => setLang(lang === "uk" ? "en" : "uk")} data-testid="checkout-lang"
              className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {lang === "uk" ? "🇺🇦 UK" : "🇬🇧 EN"}
            </button>
            <button data-testid="checkout-close-x" onClick={close} className="rounded-full p-1.5 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {/* amount due */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-5">
          <div className="text-lg font-semibold text-slate-500">{t("amount_due")}</div>
          <div className="text-right">
            <div className="text-3xl font-extrabold text-slate-900">{inv.price} {inv.payment_currency_iso}</div>
            <div className="mt-1 text-sm text-slate-400">≈${Number(usdApprox || inv.price).toFixed(2)}</div>
          </div>
        </div>

        {paid ? (
          <div data-testid="checkout-paid" className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <div className="text-lg font-bold text-emerald-700">{t("paid")}</div>
            {inv.pay_hash ? (
              <div className="w-full">
                <div className="mt-1 flex items-center gap-2 rounded-lg bg-white p-2">
                  <code data-testid="checkout-txhash" className="flex-1 break-all text-left text-[11px] text-slate-700">{inv.pay_hash}</code>
                  <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(inv.pay_hash); toast.success(t("copied")); }}><Copy className="h-4 w-4" /></Button>
                </div>
                {inv.pay_explorer && (
                  <a data-testid="checkout-explorer" href={inv.pay_explorer} target="_blank" rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
                    Переглянути в блокчейні <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : null}
            <Button data-testid="checkout-close" onClick={close} className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700">Закрити</Button>
          </div>
        ) : !pay ? (
          <div className="mt-6 space-y-5">
            {/* currency */}
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-400">{t("select_currency")}</div>
              <Select value={iso} onValueChange={(v) => { setIso(v); setNet(null); }}>
                <SelectTrigger data-testid="checkout-currency" className="h-14 rounded-2xl bg-slate-50 px-4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200">
                  {isoList.map((i) => (
                    <SelectItem key={i} value={i}>
                      <span className="flex items-center gap-2"><CoinIcon iso={i} size={22} /> {i}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* network */}
            <div>
              <div className="mb-2 text-sm font-bold text-slate-800">{t("select_network")}</div>
              <Select value={net != null ? String(net) : ""} onValueChange={(v) => setNet(Number(v))}>
                <SelectTrigger data-testid="checkout-network" className="h-14 rounded-2xl px-4">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200">
                  {(isoMap[iso] || []).map((nid, idx) => (
                    <SelectItem key={nid} value={String(nid)}>
                      <span className="flex items-center gap-2">
                        {meta.net[String(nid)]?.name || nid}
                        {idx === 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{t("best_choice")}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* summary */}
            <div className="rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500">{t("amount_in_currency")}</span>
                <span className="font-bold text-slate-900">{inv.price} {iso}</span>
              </div>
              <div className="my-2 h-px bg-slate-200" />
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500">{t("rate_valid_for")}</span>
                <span className="flex items-center gap-2 font-bold text-slate-900">
                  <RateRing left={rateLeft} total={RATE_WINDOW} />{fmtClock(rateLeft)}
                </span>
              </div>
            </div>

            <Button data-testid="checkout-pay-btn" disabled={busy || net == null} onClick={select}
              className="h-14 w-full rounded-full bg-slate-900 text-base font-bold text-white hover:bg-slate-800">
              {busy ? "…" : t("go_to_pay")}
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
              <img alt="qr" src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pay.address)}`} className="mx-auto rounded-xl bg-white p-2" />
              <div className="mt-3 text-2xl font-extrabold text-slate-900">{fmtCrypto(pay.amount_to_pay)} {pay.currency}</div>
              <div className="text-xs text-slate-400">{pay.network}</div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-2">
                <code data-testid="checkout-address" className="flex-1 break-all text-xs text-slate-700">{pay.address}</code>
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(pay.address); toast.success(t("copied")); }}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>

            {inv.amount_paid > 0 && !paid && (
              <div data-testid="checkout-partial" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <div className="font-bold text-amber-800">{t("partial_title")}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-slate-500">{t("partial_received")}</span>
                  <span data-testid="partial-received" className="font-semibold text-slate-900">{fmtCrypto(inv.amount_paid)} {pay.currency}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-500">{t("partial_remaining")}</span>
                  <span data-testid="partial-remaining" className="font-bold text-amber-700">{fmtCrypto(Math.max(0, pay.amount_to_pay - inv.amount_paid))} {pay.currency}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-100">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(100, (inv.amount_paid / pay.amount_to_pay) * 100).toFixed(1)}%` }} />
                </div>
                <div className="mt-2 text-xs text-amber-700">{t("partial_wait")}</div>
              </div>
            )}
            <div data-testid="checkout-confirmations" className="text-center text-xs text-slate-500">
              {t("credited_after")} {pay.confirmations || (inv.conf_required ?? "—")} {t("conf_of_net")} {pay.network}
              {inv.conf_current != null && inv.conf_required != null ? ` • ${inv.conf_current}/${inv.conf_required}` : ""}
            </div>
            {inv.status === "Confirming" && (
              <div className="mx-auto w-max rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{t("confirming")}</div>
            )}
          </div>
        )}

        {/* time left to pay */}
        {!paid && expiryLeft != null && (
          <div className="mt-6 text-center">
            <div className="text-sm text-slate-400">{t("time_left_pay")}</div>
            <div data-testid="checkout-expiry" className={`mt-1 flex items-center justify-center gap-2 text-lg font-bold ${expiryLeft <= 0 ? "text-rose-500" : "text-emerald-600"}`}>
              <Hourglass className="h-4 w-4" />{expiryLeft <= 0 ? t("time_up") : fmtClock(expiryLeft)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
