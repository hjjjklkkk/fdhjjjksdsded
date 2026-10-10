import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, ExternalLink, XCircle, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { StatusBadge, fmtUsd, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 20;

function periodFrom(period, from, to) {
  const now = Date.now() / 1000;
  const DAY = 86400;
  let f = null, tt = null;
  if (period === "today") f = Math.floor(now / DAY) * DAY;
  else if (period === "7d") f = now - 7 * DAY;
  else if (period === "30d") f = now - 30 * DAY;
  else if (period === "custom") {
    if (from) f = new Date(from + "T00:00:00").getTime() / 1000;
    if (to) tt = new Date(to + "T23:59:59").getTime() / 1000;
  }
  return [f, tt];
}

function FilterBar({ search, setSearch, period, setPeriod, from, setFrom, to, setTo, count, testidPrefix, placeholder }) {
  const { t } = useLang();
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input data-testid={`${testidPrefix}-search`} value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder} className="rounded-full pl-9" />
      </div>
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger data-testid={`${testidPrefix}-period`} className="rounded-full w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-white border border-slate-200">
          <SelectItem value="all">{t("period_all")}</SelectItem>
          <SelectItem value="today">{t("period_today")}</SelectItem>
          <SelectItem value="7d">{t("period_7d")}</SelectItem>
          <SelectItem value="30d">{t("period_30d")}</SelectItem>
          <SelectItem value="custom">{t("period_custom")}</SelectItem>
        </SelectContent>
      </Select>
      {period === "custom" && (
        <div className="flex items-center gap-2">
          <Input data-testid={`${testidPrefix}-date-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-full w-full sm:w-[150px]" />
          <span className="text-slate-400 text-sm">—</span>
          <Input data-testid={`${testidPrefix}-date-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-full w-full sm:w-[150px]" />
        </div>
      )}
      {(search || period !== "all") && (
        <Button variant="ghost" size="sm" data-testid={`${testidPrefix}-reset`} className="rounded-full text-slate-500"
          onClick={() => { setSearch(""); setPeriod("all"); setFrom(""); setTo(""); }}>{t("reset")}</Button>
      )}
      <span className="text-xs text-slate-400 sm:ml-auto" data-testid={`${testidPrefix}-count`}>{t("found_label")} {count}</span>
    </div>
  );
}

function Pager({ page, setPage, total, testid }) {
  const { t } = useLang();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-2" data-testid={testid}>
      <Button size="icon" variant="outline" className="rounded-full h-8 w-8" disabled={page <= 1}
        data-testid={`${testid}-prev`} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="text-xs text-slate-500" data-testid={`${testid}-label`}>{t("page_label")} {page} {t("of_label")} {pages}</span>
      <Button size="icon" variant="outline" className="rounded-full h-8 w-8" disabled={page >= pages}
        data-testid={`${testid}-next`} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}

export default function Requests() {
  const { t } = useLang();
  const [invoices, setInvoices] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [cryptos, setCryptos] = useState([]);
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [price, setPrice] = useState("");
  const [cur, setCur] = useState("USDT");
  const [desc, setDesc] = useState("");

  // invoice filters
  const [iSearch, setISearch] = useState("");
  const [iPeriod, setIPeriod] = useState("all");
  const [iFrom, setIFrom] = useState("");
  const [iTo, setITo] = useState("");
  const [iPage, setIPage] = useState(1);

  // payout filters
  const [pSearch, setPSearch] = useState("");
  const [pPeriod, setPPeriod] = useState("all");
  const [pFrom, setPFrom] = useState("");
  const [pTo, setPTo] = useState("");
  const [pPage, setPPage] = useState(1);

  const filteredInvoices = useMemo(() => {
    const q = iSearch.trim().toLowerCase();
    const [from, to] = periodFrom(iPeriod, iFrom, iTo);
    return invoices.filter((inv) => {
      const ts = inv.time_create || 0;
      if (from != null && ts < from) return false;
      if (to != null && ts > to) return false;
      if (q) {
        const hay = [inv.id, inv.order_id, inv.description, inv.payment_currency_iso].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, iSearch, iPeriod, iFrom, iTo]);

  const filteredPayouts = useMemo(() => {
    const q = pSearch.trim().toLowerCase();
    const [from, to] = periodFrom(pPeriod, pFrom, pTo);
    return payouts.filter((p) => {
      const ts = p.created_ts || 0;
      if (from != null && ts < from) return false;
      if (to != null && ts > to) return false;
      if (q) {
        const hay = [p.address, p.txid, p.hash, p.tx_hash, p.order_id, p.id, p.pr_id].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [payouts, pSearch, pPeriod, pFrom, pTo]);

  useEffect(() => { setIPage(1); }, [iSearch, iPeriod, iFrom, iTo]);
  useEffect(() => { setPPage(1); }, [pSearch, pPeriod, pFrom, pTo]);

  const pagedInvoices = filteredInvoices.slice((iPage - 1) * PAGE_SIZE, iPage * PAGE_SIZE);
  const pagedPayouts = filteredPayouts.slice((pPage - 1) * PAGE_SIZE, pPage * PAGE_SIZE);

  const load = () => api.get("/invoices").then((r) => setInvoices(r.data.data)).catch(() => {});
  const loadPayouts = () => api.get("/payouts").then((r) => setPayouts(r.data.data || [])).catch(() => {});
  useEffect(() => {
    load();
    loadPayouts();
    const iv = setInterval(loadPayouts, 15000);
    api.get("/currencies").then((r) => {
      const list = r.data.data || [];
      setCryptos(list);
      if (list.length && !list.find((c) => c.iso === cur)) setCur(list[0].iso);
    }).catch(() => {});
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, []);

  const create = async () => {
    try {
      await api.post("/invoices", { order_id: orderId, price: Number(price), payment_currency_iso: cur, description: desc });
      toast.success("Рахунок створено");
      setOpen(false); setOrderId(""); setPrice(""); setDesc(""); load();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const cancel = async (id) => {
    try { await api.post(`/invoices/${id}/cancel`); toast.success(t("cancel")); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const copyLink = (l) => { navigator.clipboard.writeText(l); toast.success(t("copied")); };
  const cancelPayout = async (pid) => {
    try { const r = await api.post(`/payouts/${pid}/cancel`); toast.success(r.data.message || "Заявку скасовано"); loadPayouts(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const deletePayout = async (pid) => {
    try { const r = await api.delete(`/payouts/${pid}`); toast.success(r.data.message || "Заявку видалено"); loadPayouts(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="space-y-6 oki-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 font-display">{t("requests")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="open-create-invoice" className="rounded-full bg-blue-600 hover:bg-blue-700"><Plus className="mr-2 h-4 w-4" />{t("create_invoice")}</Button>
          </DialogTrigger>
          <DialogContent className="bg-white sm:max-w-md">
            <DialogHeader><DialogTitle>{t("create_invoice")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Order ID</Label><Input data-testid="inv-order-id" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="rounded-xl mt-1" placeholder="напр. 1042" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("price")}</Label><Input data-testid="inv-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl mt-1" placeholder="15.00" /></div>
                <div><Label>{t("currency")}</Label>
                  <Select value={cur} onValueChange={setCur}>
                    <SelectTrigger data-testid="inv-currency" className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-white border border-slate-200">
                      {cryptos.map((c) => (<SelectItem key={c.iso} value={c.iso}>{c.iso} — {c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>{t("client")}</Label><Textarea data-testid="inv-desc" value={desc} onChange={(e) => setDesc(e.target.value)} className="rounded-xl mt-1" placeholder="Опис рахунку" /></div>
            </div>
            <DialogFooter>
              <Button data-testid="submit-invoice" disabled={!price} onClick={create} className="w-full rounded-full bg-blue-600 hover:bg-blue-700">{t("create")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* INVOICES */}
      <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 mb-3">{t("invoices_title")}</h2>
        <FilterBar search={iSearch} setSearch={setISearch} period={iPeriod} setPeriod={setIPeriod}
          from={iFrom} setFrom={setIFrom} to={iTo} setTo={setITo} count={filteredInvoices.length}
          testidPrefix="invoice" placeholder={t("search_invoice_ph")} />
        <div className="oki-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400">
              <th className="py-2">ID</th><th>Дата</th><th>Order</th><th>{t("client")}</th><th>{t("price")}</th><th>{t("status")}</th><th className="text-right">{t("pay_link")}</th>
            </tr></thead>
            <tbody>
              {pagedInvoices.map((inv) => (
                <tr key={inv.id} data-testid={`inv-row-${inv.id}`} className="border-t border-slate-100">
                  <td className="py-3 font-mono text-xs text-slate-700">{inv.id}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(inv.time_create) || "—"}</td>
                  <td className="text-slate-600">{inv.order_id}</td>
                  <td className="max-w-[160px] truncate text-slate-500">{inv.description || "—"}</td>
                  <td className="font-semibold text-slate-800">{inv.price} {inv.payment_currency_iso}</td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" data-testid={`copy-link-${inv.id}`} onClick={() => copyLink(inv.link)}><Copy className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" data-testid={`open-link-${inv.id}`} onClick={() => window.open(inv.link, "_blank")}><ExternalLink className="h-4 w-4" /></Button>
                      {["Created", "In Process"].includes(inv.status) && (
                        <Button size="icon" variant="ghost" data-testid={`cancel-${inv.id}`} onClick={() => cancel(inv.id)}><XCircle className="h-4 w-4 text-rose-500" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredInvoices.length === 0 && <div className="py-8 text-center text-sm text-slate-400">{t("no_data")}</div>}
        </div>
        <Pager page={iPage} setPage={setIPage} total={filteredInvoices.length} testid="invoice-pager" />
      </div>

      {/* PAYOUTS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100" data-testid="payouts-section">
        <h2 className="text-lg font-bold text-slate-900 mb-1">{t("payouts_title")}</h2>
        <p className="text-xs text-slate-400 mb-4">Виплати, створені мерчантом через <span className="font-mono">/api/v1/private/create-output</span></p>
        <FilterBar search={pSearch} setSearch={setPSearch} period={pPeriod} setPeriod={setPPeriod}
          from={pFrom} setFrom={setPFrom} to={pTo} setTo={setPTo} count={filteredPayouts.length}
          testidPrefix="payout" placeholder={t("search_payout_ph")} />
        <div className="oki-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400">
              <th className="py-2">ID</th><th>Дата</th><th>Order</th><th>Сума</th><th>Мережа</th><th>Адреса</th><th>Статус</th><th className="text-right">Tx</th>
            </tr></thead>
            <tbody>
              {pagedPayouts.map((p) => (
                <tr key={p.pr_id} data-testid={`payout-row-${p.order_id || p.pr_id}`} className="border-t border-slate-100">
                  <td className="py-3 font-mono text-xs text-slate-700">{p.id}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500" data-testid={`payout-date-${p.order_id || p.pr_id}`}>{fmtDateTime(p.created_ts) || "—"}</td>
                  <td className="text-slate-600">{p.order_id || "—"}</td>
                  <td className="font-semibold text-slate-800">{p.amount} {p.currency}</td>
                  <td className="text-slate-500">{p.network}</td>
                  <td className="min-w-[220px] max-w-[340px] font-mono text-[11px] leading-tight text-slate-600 break-all">
                    <div className="flex items-start gap-1">
                      <span data-testid={`payout-address-${p.order_id || p.pr_id}`} className="break-all">{p.address}</span>
                      <button type="button" title="Копіювати адресу" data-testid={`payout-copy-addr-${p.order_id || p.pr_id}`}
                        onClick={() => { navigator.clipboard.writeText(p.address || ""); toast.success(t("copied")); }}
                        className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-700"><Copy className="h-3 w-3" /></button>
                    </div>
                  </td>
                  <td>
                    <span data-testid={`payout-status-${p.order_id || p.pr_id}`} className={
                      "inline-block rounded-full px-2 py-0.5 text-xs font-medium " + (
                        p.status === "done" ? "bg-emerald-100 text-emerald-700"
                        : p.status === "error" ? "bg-rose-100 text-rose-700"
                        : p.status === "cancelled" ? "bg-slate-100 text-slate-600"
                        : "bg-amber-100 text-amber-700")}>
                      {p.internal_status === "awaiting_funds" ? t("st_awaiting_funds")
                        : p.status === "processing" ? t("st_processing")
                        : p.status === "done" ? t("st_done")
                        : p.status === "error" ? t("st_error")
                        : p.status === "cancelled" ? t("st_cancelled") : t("st_pending")}
                    </span>
                    {p.auto_converted && <span className="ml-1 text-[10px] text-blue-500">↺ {p.converted_from}</span>}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1 items-center">
                      {p.explorer_url && (
                        <Button size="icon" variant="ghost" data-testid={`payout-tx-${p.order_id || p.pr_id}`} onClick={() => window.open(p.explorer_url, "_blank")}><ExternalLink className="h-4 w-4" /></Button>
                      )}
                      {!["done", "cancelled"].includes(p.status) && (
                        <Button size="icon" variant="ghost" title="Скасувати (повернути кошти)" data-testid={`payout-cancel-${p.order_id || p.pr_id}`} onClick={() => cancelPayout(p.pr_id)}><XCircle className="h-4 w-4 text-rose-500" /></Button>
                      )}
                      {p.status !== "done" && (
                        <Button size="icon" variant="ghost" title="Видалити з бази" data-testid={`payout-delete-${p.order_id || p.pr_id}`} onClick={() => deletePayout(p.pr_id)}><Trash2 className="h-4 w-4 text-slate-400" /></Button>
                      )}
                      {!p.explorer_url && ["done", "cancelled"].includes(p.status) && <span className="text-xs text-slate-300">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPayouts.length === 0 && <div className="py-8 text-center text-sm text-slate-400">{t("no_data")}</div>}
        </div>
        <Pager page={pPage} setPage={setPPage} total={filteredPayouts.length} testid="payout-pager" />
      </div>
    </div>
  );
}
