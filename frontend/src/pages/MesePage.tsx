import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getMovimenti, getCategories, getMonthSummary,
  createMovimento, updateMovimento, deleteMovimento,
  getBudgetStatus,
  Transaction, Category, MonthSummary, DuplicateError
} from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import MovimentoForm from "../components/MovimentoForm";
import { useToast } from "../components/Toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import axios from "axios";

const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}


interface BudgetItem {
  category_id: number;
  category_name: string;
  monthly_limit: number;
  spent: number;
  remaining: number;
  percent: number;
}

export default function MesePage() {
  const { year, month } = useParams<{ year: string; month: string }>();
  const y = Number(year);
  const m = Number(month);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);

  // Duplicate modal
  const [dupInfo, setDupInfo] = useState<DuplicateError | null>(null);
  const [pendingSave, setPendingSave] = useState<null | (() => void)>(null);

  // Swipe gesture handling
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Only trigger if horizontal swipe is dominant and long enough
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) {
        // Swipe right -> previous month
        const prevM = m === 1 ? 12 : m - 1;
        const prevY = m === 1 ? y - 1 : y;
        navigate(`/anno/${prevY}/mese/${prevM}`);
      } else {
        // Swipe left -> next month
        const nextM = m === 12 ? 1 : m + 1;
        const nextY = m === 12 ? y + 1 : y;
        navigate(`/anno/${nextY}/mese/${nextM}`);
      }
    }
  }, [m, y, navigate]);

  const reload = async () => {
    try {
      const [txs, cats, sum] = await Promise.all([
        getMovimenti(y, m),
        getCategories(),
        getMonthSummary(y, m),
      ]);
      setTransactions(txs);
      setCategories(cats);
      setSummary(sum);

      // Try to load budget status (may not exist yet)
      try {
        const budget = await getBudgetStatus(y, m);
        if (Array.isArray(budget)) {
          setBudgetItems(budget.filter((b: BudgetItem) => b.monthly_limit > 0));
        }
      } catch {
        setBudgetItems([]);
      }
    } catch {
      showToast("Errore nel caricamento dei dati", "error");
    }
  };

  useEffect(() => { reload(); }, [y, m]);

  const doCreate = async (data: any, force = false) => {
    setLoading(true);
    try {
      await createMovimento({ ...data, year: y, month: m }, force);
      setShowForm(false);
      await reload();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const detail = err.response.data?.detail as DuplicateError;
        setDupInfo(detail);
        setPendingSave(() => () => doCreate(data, true));
      } else {
        showToast("Errore nel salvataggio", "error");
      }
    } finally { setLoading(false); }
  };

  const handleCreate = (data: any) => doCreate(data, false);

  const handleUpdate = async (id: number, data: any) => {
    setLoading(true);
    try {
      await updateMovimento(id, data);
      setEditingId(null);
      await reload();
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Eliminare questo movimento?")) return;
    await deleteMovimento(id);
    await reload();
  };

  const filtered = filterCat === "all"
    ? transactions
    : transactions.filter((t) => t.category.name === filterCat);

  // Group by type then by category
  const GROUP_ORDER = ["SPESA_FISSA", "SPESA_VARIABILE", "ENTRATA", "INVESTIMENTO"];
  const GROUP_LABELS: Record<string, string> = {
    SPESA_FISSA: "Spese Fisse",
    SPESA_VARIABILE: "Spese Variabili",
    ENTRATA: "Entrate",
    INVESTIMENTO: "Investimenti",
  };
  const GROUP_COLORS: Record<string, string> = {
    SPESA_FISSA: "text-purple-700 bg-purple-50 border-purple-200",
    SPESA_VARIABILE: "text-orange-700 bg-orange-50 border-orange-200",
    ENTRATA: "text-green-700 bg-green-50 border-green-200",
    INVESTIMENTO: "text-blue-700 bg-blue-50 border-blue-200",
  };

  type TypeGroup = {
    type: string;
    label: string;
    total: number;
    categories: { catName: string; txs: Transaction[] }[];
  };

  const catOrder = categories.map((c) => c.name);
  const typeGroups: TypeGroup[] = GROUP_ORDER.map((groupType) => {
    const groupTxs = filtered.filter((t) => t.category.type === groupType);
    if (groupTxs.length === 0) return null;

    const catMap: Record<string, Transaction[]> = {};
    for (const t of groupTxs) {
      catMap[t.category.name] = catMap[t.category.name] ?? [];
      catMap[t.category.name].push(t);
    }
    const sortedCats = Object.entries(catMap)
      .sort(([a], [b]) => catOrder.indexOf(a) - catOrder.indexOf(b))
      .map(([catName, txs]) => ({ catName, txs }));

    return {
      type: groupType,
      label: GROUP_LABELS[groupType],
      total: groupTxs.reduce((s, t) => s + t.amount, 0),
      categories: sortedCats,
    };
  }).filter(Boolean) as TypeGroup[];

  // Donut chart data from summary by_category
  const donutData = summary?.by_category
    ? Object.entries(summary.by_category)
        .filter(([, amt]) => amt < 0)
        .map(([name, amt]) => ({
          name,
          value: Math.abs(amt),
          meta: getCategoryMeta(name),
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const totalExpForDonut = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <div
      ref={containerRef}
      className="max-w-5xl mx-auto"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header with navigation hint */}
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/anno/${y}`} className="text-blue-600 hover:underline text-sm">&larr; {y}</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex-1">{MESI[m]} {y}</h1>
        <div className="flex gap-1">
          <button
            onClick={() => {
              const prevM = m === 1 ? 12 : m - 1;
              const prevY = m === 1 ? y - 1 : y;
              navigate(`/anno/${prevY}/mese/${prevM}`);
            }}
            className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            &lsaquo;
          </button>
          <button
            onClick={() => {
              const nextM = m === 12 ? 1 : m + 1;
              const nextY = m === 12 ? y + 1 : y;
              navigate(`/anno/${nextY}/mese/${nextM}`);
            }}
            className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            &rsaquo;
          </button>
        </div>
      </div>

      {/* Totali */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
          {[
            { label: "Entrate", value: summary.total_entrate, color: "text-green-600" },
            { label: "Uscite", value: summary.total_uscite, color: "text-red-600" },
            { label: "Risparmio", value: summary.risparmio, color: summary.risparmio >= 0 ? "text-blue-600" : "text-orange-600" },
            { label: "Spese Fisse", value: summary.spese_fisse, color: "text-purple-600" },
          ].map((item) => (
            <div key={item.label} className="card p-3">
              <p className="text-xs text-gray-500 font-medium">{item.label}</p>
              <p className={`text-base md:text-xl font-bold mt-0.5 ${item.color}`}>{fmt(item.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Donut chart for category distribution */}
      {donutData.length > 0 && (
        <div className="card mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Distribuzione spese</h2>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <ResponsiveContainer width="100%" height={180} className="sm:max-w-[200px]">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {donutData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.meta.hex} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => fmt(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 w-full grid grid-cols-2 gap-1">
              {donutData.map((d) => {
                const pct = totalExpForDonut > 0 ? ((d.value / totalExpForDonut) * 100).toFixed(0) : "0";
                return (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs py-1 px-1.5 rounded hover:bg-gray-50">
                    <span>{d.meta.icon}</span>
                    <span className="truncate text-gray-600">{d.name}</span>
                    <span className="ml-auto font-semibold text-gray-700">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Budget progress bars */}
      {budgetItems.length > 0 && (
        <div className="card mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Budget</h2>
          <div className="space-y-3">
            {budgetItems.map((b) => {
              const meta = getCategoryMeta(b.category_name);
              const pct = Math.min(100, b.percent);
              const isOver = b.percent > 100;
              return (
                <div key={b.category_id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{meta.icon}</span>
                      <span className="text-xs font-medium text-gray-700">{b.category_name}</span>
                    </div>
                    <span className={`text-xs font-semibold ${isOver ? "text-red-600" : "text-gray-500"}`}>
                      {fmt(Math.abs(b.spent))} / {fmt(b.monthly_limit)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isOver ? "bg-red-500" : "bg-blue-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
        <select
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm flex-1 dark:bg-gray-800 dark:text-gray-100"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
        >
          <option value="all">Tutte le categorie</option>
          {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <button className="btn-primary text-sm py-2" onClick={() => setShowForm(true)}>
          + Aggiungi movimento
        </button>
      </div>

      {/* Form nuovo movimento */}
      {showForm && (
        <div className="card mb-4 border border-blue-200 bg-blue-50/30">
          <h3 className="font-semibold text-sm text-gray-800 mb-3">Nuovo movimento</h3>
          <MovimentoForm
            categories={categories}
            defaultValues={{ year: y, month: m }}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            loading={loading}
          />
        </div>
      )}

      {/* Transazioni per categoria */}
      {typeGroups.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          Nessun movimento per questo mese.
        </div>
      ) : (
        <div className="space-y-5">
          {typeGroups.map((group) => (
            <div key={group.type}>
              {/* Group header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg border mb-2 ${GROUP_COLORS[group.type]}`}>
                <span className="text-sm font-bold">{group.label}</span>
                <span className={`text-sm font-bold ${group.total >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {fmt(group.total)}
                </span>
              </div>
              {/* Categories within group */}
              <div className="space-y-3 pl-1">
                {group.categories.map(({ catName, txs }) => {
                  const meta = getCategoryMeta(catName);
                  const total = txs.reduce((s, t) => s + t.amount, 0);
                  return (
                    <div key={catName} className="card">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{meta.icon}</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{catName}</span>
                        </div>
                        <span className={`font-bold text-sm ${total >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(total)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {txs.map((t) => (
                          <div key={t.id}>
                            {editingId === t.id ? (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <MovimentoForm
                                  categories={categories}
                                  defaultValues={{
                                    year: t.year, month: t.month,
                                    category_id: t.category_id,
                                    description: t.description, amount: t.amount,
                                  }}
                                  onSubmit={(d) => handleUpdate(t.id, d)}
                                  onCancel={() => setEditingId(null)}
                                  loading={loading}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 group">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {t.source === "ocr" && (
                                    <span title="Inserito via OCR" className="text-xs">📷</span>
                                  )}
                                  <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{t.description}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`text-sm font-semibold ${t.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {fmt(t.amount)}
                                  </span>
                                  <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => setEditingId(t.id)}
                                      className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-1"
                                    >✏️</button>
                                    <button
                                      onClick={() => handleDelete(t.id)}
                                      className="text-xs text-red-600 hover:text-red-800 px-1.5 py-1"
                                    >🗑</button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Swipe hint on mobile */}
      <p className="md:hidden text-center text-xs text-gray-300 mt-6 mb-2">
        Scorri a destra/sinistra per cambiare mese
      </p>

      {/* Duplicate modal */}
      {dupInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDupInfo(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="text-4xl text-center mb-3">⚠️</div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 text-center mb-2">
              Possibile duplicato
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-5">
              {dupInfo.message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDupInfo(null)}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                Annulla
              </button>
              <button
                onClick={() => { setDupInfo(null); pendingSave?.(); }}
                className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold"
              >
                Salva comunque
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
