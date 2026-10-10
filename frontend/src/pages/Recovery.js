import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { ShieldCheck, Radar, ArrowRightLeft, Search, X } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { CoinIcon, fmtUsd, fmtCrypto } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const NET_NAME = { ethereum: "Ethereum (ERC-20)", polygon: "Polygon", bsc: "BNB Chain (BEP-20)", arbitrum: "Arbitrum", tron: "TRON (TRC-20)", bitcoin: "Bitcoin" };

export default function Recovery() {
  const { t } = useLang();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [findings, setFindings] = useState([]);
  const [treasury, setTreasury] = useState("");
  const [busy, setBusy] = useState("");
  const [amt, setAmt] = useState({});
  const [addrQuery, setAddrQuery] = useState("");
  const [scope, setScope] = useState(""); // "" = all, or a specific address searched

  const scan = async (address) => {
    setScanning(true);
    try {
      const { data } = await api.get("/recovery/scan", { params: address ? { address } : {} });
      setFindings(data.findings);
      setTreasury(data.treasury);
      setScanned(true);
      setScope(address || "");
      toast.success(`${t("scanning")} ✓ EVM:${data.scanned.evm} TRON:${data.scanned.tron} BTC:${data.scanned.btc}`);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setScanning(false); }
  };

  const sweep = async (f) => {
    const key = `${f.address}-${f.chain}-${f.symbol}`;
    setBusy(key);
    try {
      const amount = amt[key] ? Number(amt[key]) : undefined;
      const { data } = await api.post("/recovery/sweep", {
        address: f.address, chain: f.chain, kind: f.kind, contract: f.contract,
        iso: f.symbol, amount,
      });
      toast.success("Повернення відправлено: " + data.data.tx_hash.slice(0, 12) + "…");
      setAmt({ ...amt, [key]: "" });
      scan(scope || undefined);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(""); }
  };

  const total = findings.reduce((s, f) => s + (f.usd || 0), 0);

  // group findings by network (chain) for an organized view
  const grouped = useMemo(() => {
    const g = {};
    findings.forEach((f) => { (g[f.chain] = g[f.chain] || []).push(f); });
    return g;
  }, [findings]);

  return (
    <div className="space-y-6 oki-fade-up">
      <div className="rounded-3xl bg-gradient-to-br from-[#0D5C46] to-[#083C2E] p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><ShieldCheck className="h-6 w-6" /></div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold font-display">{t("recovery")}</h1>
              <p className="mt-1 max-w-2xl text-sm text-emerald-100">{t("recovery_desc")}</p>
              {treasury && <div className="mt-3 text-xs text-emerald-100">{t("treasury")}: <code className="rounded bg-white/10 px-2 py-0.5">{treasury}</code></div>}
            </div>
          </div>
          {/* search by address + scan-all */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-200/70" />
              <Input data-testid="recovery-address-search" value={addrQuery} onChange={(e) => setAddrQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && addrQuery.trim()) scan(addrQuery.trim()); }}
                placeholder={t("rec_search_ph")}
                className="rounded-full border-white/20 bg-white/10 pl-9 text-white placeholder:text-emerald-100/60" />
            </div>
            <Button data-testid="recovery-search-btn" onClick={() => scan(addrQuery.trim())} disabled={scanning || !addrQuery.trim()}
              className="rounded-full bg-white text-[#0D5C46] hover:bg-emerald-50">
              <Search className="mr-2 h-4 w-4" />{t("find")}
            </Button>
            <Button data-testid="scan-btn" onClick={() => { setAddrQuery(""); scan(); }} disabled={scanning}
              variant="outline" className="rounded-full border-white/30 bg-transparent text-white hover:bg-white/10">
              <Radar className={`mr-2 h-4 w-4 ${scanning ? "animate-spin" : ""}`} />{scanning ? t("scanning") : t("scan_all_btn")}
            </Button>
          </div>
        </div>
      </div>

      {scanned && (
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-100">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-lg font-bold text-slate-900">
              {t("found_funds")}
              {scope && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-normal text-slate-500">
                {t("by_address")} {scope.slice(0, 8)}…{scope.slice(-4)}
                <button data-testid="recovery-clear-scope" onClick={() => { setScope(""); scan(); }}><X className="h-3 w-3" /></button>
              </span>}
            </div>
            {findings.length > 0 && <div className="text-sm font-semibold text-emerald-600">{fmtUsd(total)}</div>}
          </div>
          {findings.length === 0 ? (
            <div data-testid="no-funds" className="py-10 text-center text-sm text-slate-400">{t("no_funds")}</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([chain, items]) => {
                const isEvm = ["ethereum", "polygon", "bsc", "arbitrum"].includes(chain);
                return (
                  <div key={chain} data-testid={`recovery-group-${chain}`}>
                    <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-[#0D5C46]">{NET_NAME[chain] || chain}</span>
                      <span className="text-xs font-normal text-slate-400">{items.length} {t("assets_n")}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((f) => {
                        const key = `${f.address}-${f.chain}-${f.symbol}`;
                        return (
                          <div key={key} data-testid={`finding-${key}`} className="flex flex-col gap-3 rounded-2xl border border-slate-100 p-4 sm:flex-row sm:items-center">
                            <CoinIcon iso={f.known === false ? "" : f.symbol} />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-800">
                                {fmtCrypto(f.amount)} {f.symbol}
                                <span className="text-xs font-normal text-slate-400"> ({fmtUsd(f.usd)})</span>
                                {f.known === false && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{t("unknown_token")}</span>}
                              </div>
                              <code className="block truncate text-xs text-slate-400">{f.address}</code>
                            </div>
                            <div className="flex items-center gap-2 sm:w-auto">
                              <Input data-testid={`sweep-amount-${key}`} type="number" step="any" value={amt[key] || ""}
                                onChange={(e) => setAmt({ ...amt, [key]: e.target.value })}
                                placeholder={`Сума (порожнє = все)`} className="h-9 w-40 rounded-lg" />
                              <Button data-testid={`sweep-${key}`} disabled={!isEvm || busy === key} onClick={() => sweep(f)}
                                className="rounded-full bg-[#0D5C46] hover:bg-[#083C2E] whitespace-nowrap">
                                <ArrowRightLeft className="mr-2 h-4 w-4" />{busy === key ? "…" : t("extract")}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <p className="pt-2 text-xs text-slate-400">{t("wrong_net_hint")}. Для ERC-20/BEP-20 токенів на адресі має бути трохи нативного газу (ETH/BNB). Повернення працює лише для EVM-мереж.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
