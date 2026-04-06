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

const MESI_FULL = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

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

  // Usa tutte le categorie di spesa (dinamiche, non hardcoded)
  const expenseCategories = categories.filter(
    (c) => c.type === "SPESA_FISSA" || c.type === "SPESA_VARIABILE"
  );
  const fixedCats = expenseCategories.filter(c => c.type === "SPESA_FISSA");
  const varCats = expenseCategories.filter(c => c.type === "SPESA_VARIABILE");

  const handleSave = async (catId: number) => {
    const val = parseFloat((inputs[catId] ?? "").replace(",", "."));
    if (!val || val <= 0) { showToast("Inserisci un importo valido", "error"); return; }
    setSavingId(catId);
    try {
      await setBudgetLimit({ category_id: catId, monthly_limit: val });
      showToast("Budget salvato!");
      await reload();
    } catch { showToast("Errore nel salvataggio", "error"); }
    finally { setSavingId(null); }
  };

  const handleDelete = async (catId: number) => {
    setSavingId(catId);
    try {
      await deleteBudgetLimit(catId);
      showToast("Limite rimosso!");
      setInputs((prev) => { const next = { ...prev }; delete next[catId]; return next; });
      await reload();
    } catch { showToast("Errore", "error"); }
    finally { setSavingId(null); }
  };

  const getLimitForCat = (catId: number) => limits.find((l) => l.category_id === catId);

  const CatRow = ({ cat }: { cat: Category }) => {
    const meta = getCategoryMeta(cat.name);
    const existing = getLimitForCat(cat.id);
    const isSaving = savingId === cat.id;
    const statusItem = status.find(s => s.category_id === cat.id);
    const pct = statusItem ? Math.min(statusItem.percent, 100) : 0;
    const over = statusItem ? statusItem.percent > 100 : false;

    return (
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-2xl">{meta.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{cat.name}</p>
              {existing && (
                <p className="text-xs text-gray-400">Limite: {fmt(existing.monthly_limit)}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" step="0.01" min="0" placeholder="€ limite"
              className="w-28 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
              value={inputs[cat.id] ?? ""}
              onChange={(e) => setInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave(cat.id)}
            />
            <button onClick={() => handleSave(cat.id)} disabled={isSaving}
              className="btn-primary text-xs px-3 py-2">
              {isSaving ? "..." : "Salva"}
            </button>
            {existing && (
              <button onClick={() => handleDelete(cat.id)} disabled={isSaving}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1">🗑</button>
            )}
          </div>
        </div>

        {/* Barra progresso se c'è dato spesa */}
        {statusItem && existing && (
          <div className="mt-3">
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${over ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-400">
                {fmt(Math.abs(statusItem.spent))} / {fmt(existing.monthly_limit)}
              </span>
              <span className={`text-xs font-semibold ${over ? "text-red-500" : "text-green-600"}`}>
                {over ? `Sforato ${fmt(Math.abs(statusItem.remaining))}` : `Rimane ${fmt(statusItem.remaining)}`}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Budget</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Limiti di spesa mensili — {MESI_FULL[month - 1]} {year}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Caricamento...</div>
      ) : expenseCategories.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">Nessuna categoria di spesa trovata.</div>
      ) : (
        <div className="space-y-6">
          {fixedCats.length > 0 && (
            <div>
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-2">Spese Fisse</p>
              <div className="space-y-2">{fixedCats.map(cat => <CatRow key={cat.id} cat={cat} />)}</div>
            </div>
          )}
          {varCats.length > 0 && (
            <div>
              <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-2">Spese Variabili</p>
              <div className="space-y-2">{varCats.map(cat => <CatRow key={cat.id} cat={cat} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
