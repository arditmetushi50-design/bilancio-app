import { useState } from "react";
import { Category } from "../api/client";
import { useYears } from "../hooks/useYears";

interface Props {
  categories: Category[];
  defaultValues?: {
    year?: number;
    month?: number;
    category_id?: number;
    description?: string;
    amount?: number;
  };
  onSubmit: (data: {
    year: number;
    month: number;
    category_id: number;
    description: string;
    amount: number;
    source?: string;
  }) => void;
  onCancel?: () => void;
  loading?: boolean;
}

const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function MovimentoForm({ categories, defaultValues, onSubmit, onCancel, loading }: Props) {
  const now = new Date();
  const [year, setYear] = useState(defaultValues?.year ?? now.getFullYear());
  const [month, setMonth] = useState(defaultValues?.month ?? now.getMonth() + 1);
  const [categoryId, setCategoryId] = useState(defaultValues?.category_id ?? categories[0]?.id ?? 0);
  const [description, setDescription] = useState(defaultValues?.description ?? "");
  const [amount, setAmount] = useState(defaultValues?.amount?.toString() ?? "");
  const [sign, setSign] = useState<"neg" | "pos">(
    defaultValues?.amount !== undefined ? (defaultValues.amount >= 0 ? "pos" : "neg") : "neg"
  );
  const [catError, setCatError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) {
      setCatError("Seleziona una categoria");
      return;
    }
    setCatError("");
    const amtVal = parseFloat(amount.replace(",", "."));
    if (isNaN(amtVal)) return;
    onSubmit({
      year,
      month,
      category_id: categoryId,
      description,
      amount: sign === "neg" ? -Math.abs(amtVal) : Math.abs(amtVal),
    });
  };

  const years = useYears();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Anno</label>
          <select
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Mese</label>
          <select
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MESI.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Categoria</label>
        <select
          className={`w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 ${catError ? "border-red-400" : "border-gray-300 dark:border-gray-600"}`}
          value={categoryId}
          onChange={(e) => { setCategoryId(Number(e.target.value)); setCatError(""); }}
        >
          {!categoryId && <option value={0}>-- Seleziona --</option>}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {catError && <p className="text-xs text-red-500 mt-1">{catError}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Descrizione</label>
        <input
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Es. Spesa Coop 05/01"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Importo</label>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
            <button
              type="button"
              className={`px-3 py-2 font-semibold ${sign === "neg" ? "bg-red-100 text-red-700" : "bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}
              onClick={() => setSign("neg")}
            >− Uscita</button>
            <button
              type="button"
              className={`px-3 py-2 font-semibold ${sign === "pos" ? "bg-green-100 text-green-700" : "bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}
              onClick={() => setSign("pos")}
            >+ Entrata</button>
          </div>
          <input
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            type="number"
            step="0.01"
            min="0"
            required
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        {onCancel && (
          <button type="button" className="btn-ghost text-sm" onClick={onCancel}>
            Annulla
          </button>
        )}
        <button type="submit" className="btn-primary text-sm" disabled={loading}>
          {loading ? "Salvataggio..." : "Salva"}
        </button>
      </div>
    </form>
  );
}
