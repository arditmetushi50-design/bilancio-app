import { useEffect, useState } from "react";
import {
  getCategories,
  getBudgetLimits,
  setBudgetLimit,
  deleteBudgetLimit,
  getBudgetStatus,
  Category,
} from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import { useToast } from "../components/Toast";

const EXPENSE_NAMES = [
  "GAS", "LUCE", "ACQUA", "VODAFONE", "NETFLIX",
  "SPESE ALIMENTARI", "AUTOMOBILE", "SPESA SPORT",
  "USCITE E VACANZE", "TASSE", "ALTRO",
];

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

interface BudgetLimit {
  id: number;
  category_id: number;
  monthly_limit: number;
}

interface BudgetStatusItem {
  category_id: number;
  category_name: string;
  monthly_limit: number;
  spent: number;
  remaining: number;
  percent: number;
}

export default function BudgetPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [limits, setLimits] = useState<BudgetLimit[]>([]);
  const [status, setStatus] = useState<BudgetStatusItem[]>([]);
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const { showToast } = useToast();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const reload = async () => {
    try {
      const [cats, lims, st] = await Promise.all([
        getCategories(),
        getBudgetLimits(),
        getBudgetStatus(year, month),
      ]);
      setCategories(cats);
      setLimits(lims);
      setStatus(Array.isArray(st) ? st : []);

      // Initialize inputs from existing limits
      const inputMap: Record<number, string> = {};
      for (const l of lims) {
        inputMap[l.category_id] = String(l.monthly_limit);
      }
      setInputs(inputMap);
    } catch {
      showToast("Errore nel caricamento", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const expenseCategories = categories.filter(
    (c) => EXPENSE_NAMES.includes(c.name.toUpperCase())
  );

  const handleSave = async (catId: number) => {
    const val = parseFloat((inputs[catId] ?? "").replace(",", "."));
    if (!val || val <= 0) {
      showToast("Inserisci un importo valido", "error");
      return;
    }
    setSavingId(catId);
    try {
      await setBudgetLimit({ category_id: catId, monthly_limit: val });
      showToast("Budget salvato!");
      await reload();
    } catch {
      showToast("Errore nel salvataggio", "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (catId: number) => {
    setSavingId(catId);
    try {
      await deleteBudgetLimit(catId);
      showToast("Limite rimosso!");
      setInputs((prev) => {
        const next = { ...prev };
        delete next[catId];
        return next;
      });
      await reload();
    } catch {
      showToast("Errore nella rimozione", "error");
    } finally {
      setSavingId(null);
    }
  };

  const getLimitForCat = (catId: number) =>
    limits.find((l) => l.category_id === catId);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Budget</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Configura i limiti di spesa mensili per ogni categoria
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          Caricamento...
        </div>
      ) : (
        <>
          {/* Budget limits configuration */}
          <div className="space-y-2 mb-8">
            {expenseCategories.map((cat) => {
              const meta = getCategoryMeta(cat.name);
              const existing = getLimitForCat(cat.id);
              const isSaving = savingId === cat.id;

              return (
                <div key={cat.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-2xl">{meta.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{cat.name}</p>
                      {existing && (
                        <p className="text-xs text-gray-400">
                          Limite attuale: {fmt(existing.monthly_limit)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={inputs[cat.id] ?? ""}
                      onChange={(e) =>
                        setInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))
                      }
                    />
                    <span className="text-xs text-gray-400">EUR</span>
                    <button
                      onClick={() => handleSave(cat.id)}
                      disabled={isSaving}
                      className="btn-primary text-xs px-3 py-2"
                    >
                      {isSaving ? "..." : "Salva"}
                    </button>
                    {existing && (
                      <button
                        onClick={() => handleDelete(cat.id)}
                        disabled={isSaving}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {expenseCategories.length === 0 && (
              <div className="card text-center py-10 text-gray-400">
                Nessuna categoria di spesa trovata.
              </div>
            )}
          </div>

          {/* Budget status */}
          {status.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-3">
                Stato Budget &mdash; {month}/{year}
              </h2>
              <div className="space-y-2">
                {status.map((s) => {
                  const meta = getCategoryMeta(s.category_name);
                  const pct = Math.min(s.percent, 100);
                  const over = s.percent > 100;

                  return (
                    <div key={s.category_id} className="card">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xl">{meta.icon}</span>
                        <p className="text-sm font-medium text-gray-800 flex-1 truncate">
                          {s.category_name}
                        </p>
                        <span className={`text-sm font-bold ${over ? "text-red-600" : "text-gray-700"}`}>
                          {fmt(Math.abs(s.spent))} / {fmt(s.monthly_limit)}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all ${over ? "bg-red-500" : meta.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-gray-400">
                          {s.percent.toFixed(0)}% utilizzato
                        </span>
                        <span className={`text-xs ${over ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                          {over
                            ? `Sforato di ${fmt(Math.abs(s.remaining))}`
                            : `Rimanente: ${fmt(s.remaining)}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {status.length === 0 && limits.length > 0 && (
            <div className="card text-center py-6 text-gray-400 text-sm">
              Nessun dato di spesa per questo mese.
            </div>
          )}
        </>
      )}
    </div>
  );
}
