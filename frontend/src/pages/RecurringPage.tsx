import { useEffect, useState } from "react";
import {
  getRecurring, createRecurring, updateRecurring, deleteRecurring, applyRecurring,
  getRecurringSuggestions, getRecurringForecast, getRecurringInsights,
  getRecurringHistory, getRecurringAnomalies, dismissSuggestion,
  getCategories, Category
} from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import { useToast } from "../components/Toast";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecurringItem {
  id: number; category_id: number;
  category?: { id: number; name: string; type: string };
  description: string; amount: number; day_of_month: number; active: boolean;
}
interface Suggestion {
  description: string; normalized_description: string;
  category_id: number; category_name: string; category_type: string;
  avg_amount: number; min_amount: number; max_amount: number;
  amount_variation: number;
  months_count: number; confidence: "alto" | "medio" | "basso";
  already_added: boolean; is_dismissed: boolean;
  years_seen: number[]; yearly_avg: Record<string, number>;
  frequency_label: string; frequency_months: number;
  next_expected_label: string; next_expected_year: number; next_expected_month: number;
  annualized_cost: number; is_subscription: boolean;
  last_seen_label: string;
  months_list: { year: number; month: number; label: string }[];
}
interface ForecastItem { id: number; description: string; category_name: string; amount: number; is_income: boolean; }
interface MonthForecast {
  year: number; month: number; label: string;
  appeared: ForecastItem[]; still_expected: ForecastItem[];
  appeared_count: number; still_expected_count: number;
  total_income_now: number; total_expense_now: number;
  expected_expenses_remaining: number; expected_income_remaining: number;
  forecast_balance: number;
}
interface Forecast {
  appeared: ForecastItem[]; still_expected: ForecastItem[];
  appeared_count: number; still_expected_count: number;
  total_income_now: number; total_expense_now: number;
  expected_expenses_remaining: number; expected_income_remaining: number;
  forecast_balance: number; fixed_monthly_cost: number;
  income_monthly_recurring: number; burden_pct: number; avg_monthly_income: number;
  months: MonthForecast[];
}
interface Insight { icon: string; text: string; type: string; severity: "info" | "warning" | "success"; }
interface Anomaly { type: string; severity: string; icon: string; description: string; category_name: string; text: string; detail: any; }
interface HistoryItem {
  id: number; description: string; category_name: string; amount: number;
  yearly: Record<string, { total: number; count: number; avg: number }>;
  monthly: { period: string; year: number; month: number; total: number; label: string }[];
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}
const MESI_IT = ["","Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                 "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const CONF = {
  alto:  { label: "Alta",  bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  medio: { label: "Media", bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  basso: { label: "Bassa", bg: "bg-gray-100 text-gray-600 dark:bg-gray-700" },
};
const SEVERITY_STYLE: Record<string, string> = {
  info:    "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
  warning: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
  success: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",
};

// ── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, icon, count, children, defaultOpen = true }: {
  title: string; icon: string; count?: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-0 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</span>
          {count !== undefined && (
            <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">{count}</span>
          )}
        </div>
        <span className={`text-gray-400 text-xs transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecurringPage() {
  const now = new Date();
  const Y = now.getFullYear(), M = now.getMonth() + 1;

  const [items, setItems]           = useState<RecurringItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [forecast, setForecast]     = useState<Forecast | null>(null);
  const [insights, setInsights]     = useState<Insight[]>([]);
  const [anomalies, setAnomalies]   = useState<Anomaly[]>([]);
  const [history, setHistory]       = useState<HistoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAllSugg, setShowAllSugg] = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);
  const [loadingSugg, setLoadingSugg]   = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [editDesc, setEditDesc]     = useState("");
  const [editCatId, setEditCatId]   = useState(0);
  const [editAmount, setEditAmount] = useState("");
  const [selectedHistory, setSelectedHistory] = useState<number | null>(null);
  const [forecastMonth, setForecastMonth] = useState(0); // 0=current, 1=next
  const { showToast } = useToast();

  // Form
  const [formCatId, setFormCatId]     = useState(0);
  const [formDesc, setFormDesc]       = useState("");
  const [formAmount, setFormAmount]   = useState("");
  const [formSign, setFormSign]       = useState<"neg"|"pos">("neg");

  const reload = async () => {
    const [rec, cats] = await Promise.all([getRecurring(), getCategories()]);
    setItems(rec);
    setCategories(cats);
    if (cats.length > 0 && !formCatId) setFormCatId(cats[0].id);
    const [fc, ins, anom, hist] = await Promise.all([
      getRecurringForecast(Y, M, 2),
      getRecurringInsights(Y, M),
      getRecurringAnomalies(Y, M),
      getRecurringHistory(),
    ]);
    setForecast(fc);
    setInsights(ins);
    setAnomalies(anom);
    setHistory(hist);
  };

  const loadSuggestions = async () => {
    setLoadingSugg(true);
    try { setSuggestions(await getRecurringSuggestions()); }
    catch { showToast("Errore analisi", "error"); }
    finally { setLoadingSugg(false); }
  };

  useEffect(() => {
    reload();
    loadSuggestions();
  }, []);

  const handleApprove = async (s: Suggestion) => {
    try {
      await createRecurring({ category_id: s.category_id, description: s.description,
        amount: s.avg_amount, day_of_month: 1, active: true });
      setSuggestions(prev => prev.map(x =>
        x.normalized_description === s.normalized_description ? { ...x, already_added: true } : x));
      await reload();
      showToast(`"${s.description}" aggiunto!`);
    } catch { showToast("Errore", "error"); }
  };

  const handleDismiss = async (s: Suggestion) => {
    try {
      await dismissSuggestion(s.normalized_description, s.category_id);
      setSuggestions(prev => prev.map(x =>
        x.normalized_description === s.normalized_description ? { ...x, is_dismissed: true } : x));
      showToast("Ignorato");
    } catch { showToast("Errore", "error"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Eliminare?")) return;
    await deleteRecurring(id);
    await reload();
    showToast("Eliminato");
  };

  const handleApply = async () => {
    setLoadingApply(true);
    try {
      const r = await applyRecurring(Y, M);
      const n = Array.isArray(r.created) ? r.created.length : 0;
      showToast(`${n} movimenti creati per ${MESI_IT[M]}!`);
      await reload();
    } catch { showToast("Errore", "error"); }
    finally { setLoadingApply(false); }
  };

  const handleCreate = async () => {
    const amt = parseFloat(formAmount.replace(",", "."));
    if (!amt || !formCatId || !formDesc.trim()) { showToast("Compila tutti i campi", "error"); return; }
    await createRecurring({ category_id: formCatId, description: formDesc.trim(),
      amount: formSign === "neg" ? -Math.abs(amt) : Math.abs(amt), active: true });
    showToast("Aggiunto!"); setShowForm(false); setFormDesc(""); setFormAmount("");
    await reload();
  };

  const startEdit = (item: RecurringItem) => {
    setEditingId(item.id);
    setEditDesc(item.description);
    setEditCatId(item.category_id);
    setEditAmount(String(Math.abs(item.amount)));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const item = items.find(i => i.id === editingId);
    if (!item) return;
    const amt = parseFloat(editAmount.replace(",", "."));
    if (!amt || !editDesc.trim()) { showToast("Compila tutti i campi", "error"); return; }
    const sign = item.amount < 0 ? -1 : 1;
    await updateRecurring(editingId, {
      description: editDesc.trim(),
      category_id: editCatId,
      amount: Math.abs(amt) * sign,
    });
    setEditingId(null);
    await reload();
    showToast("Aggiornato!");
  };

  // Derived data
  const newSuggestions   = suggestions.filter(s => !s.already_added && !s.is_dismissed);
  const toShowSugg       = showAllSugg ? newSuggestions : newSuggestions.slice(0, 5);
  const highConfSugg     = newSuggestions.filter(s => s.confidence === "alto");
  const subscriptions    = items.filter(i =>
    i.amount < 0 && (i.category?.name?.toUpperCase() === "NETFLIX" ||
      ["netflix","spotify","amazon","disney","sky","dazn"].some(k =>
        i.description.toLowerCase().includes(k))));

  const getCatName = (item: RecurringItem) =>
    item.category?.name ?? categories.find(c => c.id === item.category_id)?.name ?? "—";

  // Burden chart data
  const burdenData = items
    .filter(i => i.amount < 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 8)
    .map(i => ({ name: i.description.slice(0, 14), value: Math.abs(i.amount), meta: getCategoryMeta(getCatName(i)) }));

  // Current forecast month view
  const currentForecastMonth = forecast?.months?.[forecastMonth] ?? null;

  // History chart for selected item
  const selectedHistoryItem = history.find(h => h.id === selectedHistory);
  const historyChartData = selectedHistoryItem?.monthly?.map(m => ({
    label: m.label,
    amount: m.total,
  })) ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* ── HEADER ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Ricorrenti & Previsioni</h1>
          <p className="text-xs text-gray-500 mt-0.5">Cashflow ricorrente · {MESI_IT[M]} {Y}</p>
        </div>
        <button onClick={handleApply} disabled={loadingApply || items.length === 0}
          className="btn-primary text-sm shrink-0">
          {loadingApply ? "..." : `Applica a ${MESI_IT[M]}`}
        </button>
      </div>

      {/* ── HERO KPI ── */}
      {forecast && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="card p-3 border-l-4 border-l-red-500">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Costi fissi/mese</p>
            <p className="text-base font-bold text-red-600 mt-0.5">{fmt(forecast.fixed_monthly_cost)}</p>
            {forecast.burden_pct > 0 && (
              <p className="text-[10px] text-gray-400 mt-0.5">{forecast.burden_pct}% del reddito</p>
            )}
          </div>
          <div className="card p-3 border-l-4 border-l-green-500">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Entrate ricorrenti</p>
            <p className="text-base font-bold text-green-600 mt-0.5">{fmt(forecast.income_monthly_recurring)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">stimate/mese</p>
          </div>
          <div className={`card p-3 border-l-4 ${forecast.forecast_balance >= 0 ? "border-l-blue-500" : "border-l-orange-500"}`}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Saldo previsto</p>
            <p className={`text-base font-bold mt-0.5 ${forecast.forecast_balance >= 0 ? "text-blue-600" : "text-orange-600"}`}>
              {fmt(forecast.forecast_balance)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">fine {MESI_IT[M]}</p>
          </div>
          <div className={`card p-3 border-l-4 ${forecast.still_expected_count > 0 ? "border-l-amber-500" : "border-l-gray-300"}`}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Da arrivare</p>
            <p className={`text-base font-bold mt-0.5 ${forecast.still_expected_count > 0 ? "text-amber-600" : "text-gray-400"}`}>
              {forecast.still_expected_count} voci
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {forecast.expected_expenses_remaining < 0 ? fmt(forecast.expected_expenses_remaining) : "tutto arrivato"}
            </p>
          </div>
        </div>
      )}

      {/* ── INSIGHTS AI ── */}
      {insights.length > 0 && (
        <Section title="Insights" icon="💡" count={insights.length} defaultOpen={true}>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${SEVERITY_STYLE[ins.severity] ?? SEVERITY_STYLE.info}`}>
                <span className="text-base shrink-0 mt-0.5">{ins.icon}</span>
                <p className="text-gray-700 dark:text-gray-200 leading-snug">{ins.text}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── ANOMALIES ── */}
      {anomalies.length > 0 && (
        <Section title="Anomalie rilevate" icon="⚠️" count={anomalies.length} defaultOpen={true}>
          <div className="space-y-2">
            {anomalies.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info}`}>
                <span className="text-base shrink-0 mt-0.5">{a.icon}</span>
                <div className="flex-1">
                  <p className="text-gray-700 dark:text-gray-200 leading-snug">{a.text}</p>
                  {a.type === "amount_spike" && a.detail && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      range storico: {fmt(a.detail.min)} — {fmt(a.detail.max)} · media: {fmt(a.detail.avg)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── FORECAST: timeline mese corrente + successivo ── */}
      {forecast && forecast.months && forecast.months.length > 0 && (
        <Section title="Previsione mensile" icon="📅" defaultOpen={true}>
          {/* Month tabs */}
          {forecast.months.length > 1 && (
            <div className="flex gap-1 mb-3">
              {forecast.months.map((m, i) => (
                <button key={i} onClick={() => setForecastMonth(i)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    forecastMonth === i
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {currentForecastMonth && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentForecastMonth.appeared_count > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-1.5">
                      Registrati ({currentForecastMonth.appeared_count})
                    </p>
                    <div className="space-y-1">
                      {currentForecastMonth.appeared.map(item => {
                        const meta = getCategoryMeta(item.category_name);
                        return (
                          <div key={item.id} className="flex items-center gap-2 py-1 opacity-60">
                            <span className="text-sm">{meta.icon}</span>
                            <span className="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate">{item.description}</span>
                            <span className={`text-xs font-semibold ${item.amount >= 0 ? "text-green-600" : "text-gray-500"}`}>
                              {fmt(item.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {currentForecastMonth.still_expected_count > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1.5">
                      Ancora attesi ({currentForecastMonth.still_expected_count})
                    </p>
                    <div className="space-y-1">
                      {currentForecastMonth.still_expected.map(item => {
                        const meta = getCategoryMeta(item.category_name);
                        return (
                          <div key={item.id} className="flex items-center gap-2 py-1">
                            <span className="text-sm">{meta.icon}</span>
                            <span className="flex-1 text-xs text-gray-700 dark:text-gray-200 truncate">{item.description}</span>
                            <span className={`text-xs font-semibold ${item.amount >= 0 ? "text-green-600" : "text-amber-600"}`}>
                              {fmt(item.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-month balance summary bar */}
              {forecast.months.length > 1 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-2">Saldo previsto per mese</p>
                  <div className="flex gap-2">
                    {forecast.months.map((m, i) => (
                      <div key={i} className="flex-1 text-center">
                        <p className="text-[9px] text-gray-400 mb-1">{m.label}</p>
                        <p className={`text-xs font-bold ${m.forecast_balance >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                          {fmt(m.forecast_balance)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Burden bar */}
              {forecast.avg_monthly_income > 0 && forecastMonth === 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>Spese ricorrenti su reddito medio</span>
                    <span>{forecast.burden_pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${forecast.burden_pct > 60 ? "bg-red-500" : forecast.burden_pct > 40 ? "bg-amber-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(100, forecast.burden_pct)}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {/* ── RICORRENTI CONFERMATI ── */}
      <Section title="Confermati" icon="✅" count={items.length} defaultOpen={true}>
        <div className="flex items-center justify-end mb-2">
          <button onClick={() => setShowForm(!showForm)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            {showForm ? "Annulla" : "+ Aggiungi"}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="mb-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-2">
            <select className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formCatId} onChange={e => setFormCatId(Number(e.target.value))}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Descrizione" />
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                <button type="button" onClick={() => setFormSign("neg")}
                  className={`px-3 py-2 font-semibold ${formSign==="neg" ? "bg-red-100 text-red-700" : "bg-gray-50 text-gray-500"}`}>
                  Uscita</button>
                <button type="button" onClick={() => setFormSign("pos")}
                  className={`px-3 py-2 font-semibold ${formSign==="pos" ? "bg-green-100 text-green-700" : "bg-gray-50 text-gray-500"}`}>
                  Entrata</button>
              </div>
              <input type="number" step="0.01" min="0" placeholder="0.00"
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                value={formAmount} onChange={e => setFormAmount(e.target.value)} />
            </div>
            <button onClick={handleCreate} className="btn-primary text-sm w-full">Salva</button>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">🔁</p>
            <p className="text-sm">Nessun ricorrente confermato</p>
            <p className="text-xs mt-1">Usa i suggerimenti AI qui sotto per aggiungerli</p>
          </div>
        ) : (
          <>
            {/* Totale mensile */}
            <div className="flex justify-between items-center px-1 py-2 mb-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-xs text-gray-400">Totale uscite fisse</span>
              <span className="text-sm font-bold text-red-600">
                {fmt(Math.abs(items.reduce((s, i) => s + (i.amount < 0 ? i.amount : 0), 0)))} /mese
              </span>
            </div>

            {/* Lista */}
            <div className="space-y-1 mb-4">
              {items.map(item => {
                const catName = getCatName(item);
                const meta = getCategoryMeta(catName);
                const isEditing = editingId === item.id;

                if (isEditing) {
                  return (
                    <div key={item.id} className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-2">
                      <input className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100"
                        value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Descrizione" />
                      <div className="flex gap-2">
                        <select className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100"
                          value={editCatId} onChange={e => setEditCatId(Number(e.target.value))}>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input type="number" step="0.01" min="0"
                          className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100"
                          value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1">Annulla</button>
                        <button onClick={saveEdit} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 font-semibold">Salva</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={item.id} className="flex items-center gap-2 py-1.5 group rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 px-1">
                    <span className="text-lg">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{item.description}</p>
                      <p className="text-[10px] text-gray-400">{catName}</p>
                    </div>
                    <span className={`text-sm font-bold ${item.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmt(item.amount)}
                    </span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(item)}
                        className="text-xs text-blue-400 hover:text-blue-600 px-1">✏️</button>
                      <button onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-400 hover:text-red-600 px-1">🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Burden chart */}
            {burdenData.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-2">Peso per voce</p>
                <ResponsiveContainer width="100%" height={Math.max(80, burdenData.length * 28)}>
                  <BarChart data={burdenData} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {burdenData.map((entry, i) => (
                        <Cell key={i} fill={entry.meta.hex} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </Section>

      {/* ── TREND STORICO ── */}
      {history.length > 0 && (
        <Section title="Trend storico" icon="📊" count={history.length} defaultOpen={false}>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1 mb-2">
              {history.map(h => (
                <button key={h.id} onClick={() => setSelectedHistory(selectedHistory === h.id ? null : h.id)}
                  className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-colors ${
                    selectedHistory === h.id
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800"
                  }`}>
                  {h.description.slice(0, 18)}
                </button>
              ))}
            </div>

            {selectedHistoryItem && (
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  {selectedHistoryItem.description} — {selectedHistoryItem.category_name}
                </p>

                {/* Yearly summary */}
                <div className="flex gap-3 mb-3 flex-wrap">
                  {Object.entries(selectedHistoryItem.yearly).map(([y, data]) => (
                    <div key={y} className="flex flex-col items-center">
                      <span className="text-[9px] text-gray-400">{y}</span>
                      <span className="text-xs font-bold text-red-600">{fmt(data.avg)}/mese</span>
                      <span className="text-[9px] text-gray-400">{data.count}x · {fmt(data.total)}</span>
                    </div>
                  ))}
                </div>

                {/* Monthly trend chart */}
                {historyChartData.length > 1 && (
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={historyChartData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9 }} width={50} />
                      <Tooltip formatter={(v) => fmt(Number(v))} />
                      <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── ABBONAMENTI ── */}
      {subscriptions.length > 0 && (
        <Section title="Abbonamenti digitali" icon="📱" count={subscriptions.length} defaultOpen={true}>
          <div className="space-y-1">
            {subscriptions.map(sub => {
              const meta = getCategoryMeta(getCatName(sub));
              const annual = Math.abs(sub.amount) * 12;
              return (
                <div key={sub.id} className="flex items-center gap-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 px-1">
                  <span>{meta.icon}</span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">{sub.description}</span>
                  <span className="text-xs text-red-600 font-semibold">{fmt(sub.amount)}/mese</span>
                  <span className="text-[10px] text-gray-400">{fmt(annual)}/anno</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── SUGGERITI DALL'AI ── */}
      <Section title="Suggeriti dall'AI" icon="🤖"
        count={newSuggestions.length}
        defaultOpen={newSuggestions.length > 0}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-400">
            {highConfSugg.length > 0
              ? `${highConfSugg.length} ad alta confidenza · ${newSuggestions.length} totali`
              : `${newSuggestions.length} da valutare`}
          </p>
          <button onClick={loadSuggestions} disabled={loadingSugg}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            {loadingSugg ? "..." : "Rianalizza"}
          </button>
        </div>

        {loadingSugg ? (
          <div className="py-10 text-center">
            <p className="text-2xl mb-2 animate-bounce">🤖</p>
            <p className="text-xs text-gray-400">Analizzando lo storico...</p>
          </div>
        ) : newSuggestions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Tutti i pattern trovati sono stati gestiti
          </p>
        ) : (
          <div className="space-y-2">
            {toShowSugg.map(s => {
              const meta = getCategoryMeta(s.category_name);
              const conf = CONF[s.confidence];
              const isIncome = s.avg_amount > 0;
              const hasVariation = s.amount_variation > 1.1;
              return (
                <div key={s.normalized_description + s.category_id}
                  className="border border-gray-100 dark:border-gray-700 rounded-xl p-3 hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
                  <div className="flex items-start gap-2">
                    <span className="text-xl mt-0.5">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      {/* Row 1: name + confidence */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{s.description}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${conf.bg}`}>
                          {conf.label}
                        </span>
                        {s.is_subscription && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">abbonamento</span>
                        )}
                      </div>
                      {/* Row 2: meta info */}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400 mt-0.5">
                        <span>{s.category_name}</span>
                        <span>{s.frequency_label} · {s.months_count} mesi</span>
                        <span>prossimo: {s.next_expected_label}</span>
                        <span>{fmt(s.annualized_cost)}/anno</span>
                      </div>
                      {/* Row 3: variation + range */}
                      {hasVariation && (
                        <p className="text-[10px] text-amber-500 mt-0.5">
                          variazione: {fmt(s.min_amount)} — {fmt(s.max_amount)} ({s.amount_variation.toFixed(1)}x)
                        </p>
                      )}
                      {/* Row 4: last seen */}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        ultimo: {s.last_seen_label}
                      </p>
                      {/* Trend anno per anno */}
                      {Object.keys(s.yearly_avg).length > 1 && (
                        <div className="flex gap-3 mt-1.5 flex-wrap">
                          {Object.entries(s.yearly_avg).map(([y, avg]) => (
                            <div key={y} className="flex flex-col items-center">
                              <span className="text-[9px] text-gray-400">{y}</span>
                              <span className={`text-[10px] font-bold ${isIncome ? "text-green-600" : "text-red-600"}`}>
                                {fmt(Math.abs(avg))}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Amount + actions */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-sm font-bold ${isIncome ? "text-green-600" : "text-red-600"}`}>
                        {fmt(s.avg_amount)}/mese
                      </span>
                      <div className="flex gap-1">
                        <button onClick={() => handleDismiss(s)}
                          className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                          Ignora
                        </button>
                        <button onClick={() => handleApprove(s)}
                          className="text-[10px] bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 font-semibold">
                          Aggiungi
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {newSuggestions.length > 5 && (
              <button onClick={() => setShowAllSugg(!showAllSugg)}
                className="w-full text-xs text-blue-600 hover:text-blue-800 font-medium py-2 border border-blue-100 rounded-xl hover:bg-blue-50 transition-colors">
                {showAllSugg
                  ? "Mostra meno"
                  : `Mostra tutti (${newSuggestions.length - 5} altri)`}
              </button>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
