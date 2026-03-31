import { useEffect, useState } from "react";
import {
  getRecurring, createRecurring, deleteRecurring, applyRecurring, getCategories, Category
} from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import { useToast } from "../components/Toast";

interface RecurringItem {
  id: number;
  category_id: number;
  category?: { id: number; name: string; type: string };
  description: string;
  amount: number;
  is_active: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function RecurringPage() {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const { showToast } = useToast();

  // Form state
  const [formCatId, setFormCatId] = useState<number>(0);
  const [formDesc, setFormDesc] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formSign, setFormSign] = useState<"neg" | "pos">("neg");

  const reload = async () => {
    try {
      const [rec, cats] = await Promise.all([getRecurring(), getCategories()]);
      setItems(rec);
      setCategories(cats);
      if (cats.length > 0 && !formCatId) setFormCatId(cats[0].id);
    } catch {
      showToast("Errore nel caricamento", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleCreate = async () => {
    const amtVal = parseFloat(formAmount.replace(",", "."));
    if (!amtVal || !formCatId || !formDesc.trim()) {
      showToast("Compila tutti i campi", "error");
      return;
    }
    try {
      await createRecurring({
        category_id: formCatId,
        description: formDesc.trim(),
        amount: formSign === "neg" ? -Math.abs(amtVal) : Math.abs(amtVal),
        is_active: true,
      });
      showToast("Ricorrente aggiunto!");
      setShowForm(false);
      setFormDesc("");
      setFormAmount("");
      await reload();
    } catch {
      showToast("Errore nel salvataggio", "error");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Eliminare questo ricorrente?")) return;
    try {
      await deleteRecurring(id);
      showToast("Eliminato!");
      await reload();
    } catch {
      showToast("Errore", "error");
    }
  };

  const handleApply = async () => {
    const now = new Date();
    setApplying(true);
    try {
      const result = await applyRecurring(now.getFullYear(), now.getMonth() + 1);
      showToast(`${result.created ?? 0} movimenti creati!`);
    } catch {
      showToast("Errore nell'applicazione", "error");
    } finally {
      setApplying(false);
    }
  };

  const getCatName = (item: RecurringItem) => {
    if (item.category?.name) return item.category.name;
    return categories.find((c) => c.id === item.category_id)?.name ?? "—";
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Ricorrenti</h1>
          <p className="text-xs text-gray-500 mt-0.5">Movimenti che si ripetono ogni mese</p>
        </div>
        <button
          onClick={handleApply}
          disabled={applying}
          className="btn-primary text-sm"
        >
          {applying ? "Applicazione..." : "Applica al mese corrente"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Caricamento...</div>
      ) : (
        <>
          {/* Add button */}
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-ghost text-sm mb-4 w-full sm:w-auto"
          >
            {showForm ? "Annulla" : "+ Aggiungi ricorrente"}
          </button>

          {/* Form */}
          {showForm && (
            <div className="card mb-4 border border-blue-200 bg-blue-50/30">
              <h3 className="font-semibold text-sm text-gray-800 mb-3">Nuovo ricorrente</h3>
              <div className="flex flex-col gap-3">
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={formCatId}
                  onChange={(e) => setFormCatId(Number(e.target.value))}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Descrizione"
                />
                <div className="flex gap-2">
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                    <button
                      type="button"
                      className={`px-3 py-2 font-semibold ${formSign === "neg" ? "bg-red-100 text-red-700" : "bg-gray-50 text-gray-500"}`}
                      onClick={() => setFormSign("neg")}
                    >&minus; Uscita</button>
                    <button
                      type="button"
                      className={`px-3 py-2 font-semibold ${formSign === "pos" ? "bg-green-100 text-green-700" : "bg-gray-50 text-gray-500"}`}
                      onClick={() => setFormSign("pos")}
                    >+ Entrata</button>
                  </div>
                  <input
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </div>
                <button onClick={handleCreate} className="btn-primary text-sm self-end">
                  Salva
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {items.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">
              Nessun movimento ricorrente configurato.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const catName = getCatName(item);
                const meta = getCategoryMeta(catName);
                return (
                  <div key={item.id} className="card flex items-center gap-3">
                    <span className="text-2xl">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.description}</p>
                      <p className="text-xs text-gray-400">{catName}</p>
                    </div>
                    <span className={`text-sm font-bold ${item.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmt(item.amount)}
                    </span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
