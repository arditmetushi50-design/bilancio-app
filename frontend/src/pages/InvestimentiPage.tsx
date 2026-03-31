import { useEffect, useState } from "react";
import {
  getInvestimenti, createInvestimento, updateInvestimento, deleteInvestimento,
  getRiepilogoInvestimenti, Investment
} from "../api/client";

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

const ASSET_TYPES = ["Crypto", "ETF", "Altro"];

export default function InvestimentiPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [riepilogo, setRiepilogo] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    asset: "",
    asset_type: "Crypto",
    amount_invested: "",
    current_value: "",
    notes: "",
  });

  const reload = async () => {
    const [invs, riep] = await Promise.all([getInvestimenti(), getRiepilogoInvestimenti()]);
    setInvestments(invs);
    setRiepilogo(riep);
  };

  useEffect(() => { reload(); }, []);

  const resetForm = () => setForm({
    date: new Date().toISOString().slice(0, 10),
    asset: "", asset_type: "Crypto",
    amount_invested: "", current_value: "", notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      date: form.date,
      asset: form.asset,
      asset_type: form.asset_type,
      amount_invested: parseFloat(form.amount_invested),
      current_value: form.current_value ? parseFloat(form.current_value) : undefined,
      notes: form.notes || undefined,
    };
    if (editingId) {
      await updateInvestimento(editingId, data);
      setEditingId(null);
    } else {
      await createInvestimento(data);
    }
    resetForm();
    setShowForm(false);
    await reload();
  };

  const startEdit = (inv: Investment) => {
    setForm({
      date: inv.date,
      asset: inv.asset,
      asset_type: inv.asset_type,
      amount_invested: inv.amount_invested.toString(),
      current_value: inv.current_value?.toString() ?? "",
      notes: inv.notes ?? "",
    });
    setEditingId(inv.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Eliminare questo investimento?")) return;
    await deleteInvestimento(id);
    await reload();
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Investimenti</h1>

      {/* Riepilogo */}
      {riepilogo && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="card border-l-4 border-l-blue-500">
            <p className="text-xs text-gray-500">Capitale investito</p>
            <p className="text-xl font-bold text-blue-600">{fmt(riepilogo.total_invested)}</p>
          </div>
          <div className="card border-l-4 border-l-green-500">
            <p className="text-xs text-gray-500">Valore attuale</p>
            <p className="text-xl font-bold text-green-600">{fmt(riepilogo.total_current_value) || "—"}</p>
          </div>
          <div className="card border-l-4 border-l-purple-500">
            <p className="text-xs text-gray-500">Rendimento €</p>
            <p className={`text-xl font-bold ${(riepilogo.rendimento_euro ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {fmt(riepilogo.rendimento_euro)}
            </p>
          </div>
          <div className="card border-l-4 border-l-orange-500">
            <p className="text-xs text-gray-500">Rendimento %</p>
            <p className={`text-xl font-bold ${(riepilogo.rendimento_pct ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {riepilogo.rendimento_pct != null ? `${riepilogo.rendimento_pct.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          className="btn-primary text-sm"
          onClick={() => { resetForm(); setEditingId(null); setShowForm(true); }}
        >
          + Nuovo investimento
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card border border-blue-200 bg-blue-50/30 mb-4">
          <h3 className="font-semibold text-sm text-gray-800 mb-3">
            {editingId ? "Modifica investimento" : "Nuovo investimento"}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Asset</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Binance, Scalable, Crypto.com..."
                value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })}>
                {ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Capitale investito (€)</label>
              <input type="number" step="0.01" min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.amount_invested} onChange={(e) => setForm({ ...form, amount_invested: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Valore attuale (€) — opzionale</label>
              <input type="number" step="0.01" min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-2 flex gap-2 justify-end pt-1">
              <button type="button" className="btn-ghost text-sm"
                onClick={() => { setShowForm(false); setEditingId(null); }}>Annulla</button>
              <button type="submit" className="btn-primary text-sm">Salva</button>
            </div>
          </form>
        </div>
      )}

      {/* Lista */}
      <div className="card">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="text-left py-2">Data</th>
              <th className="text-left py-2">Asset</th>
              <th className="text-left py-2">Tipo</th>
              <th className="text-right py-2">Investito</th>
              <th className="text-right py-2">Attuale</th>
              <th className="text-right py-2">Rendimento</th>
              <th className="text-left py-2">Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {investments.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Nessun investimento registrato</td></tr>
            ) : investments.map((inv) => {
              const rend = inv.current_value != null ? inv.current_value - inv.amount_invested : null;
              return (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50 group">
                  <td className="py-2 text-gray-600">{inv.date}</td>
                  <td className="py-2 font-medium">{inv.asset}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      inv.asset_type === "ETF" ? "bg-blue-100 text-blue-700" :
                      inv.asset_type === "Crypto" ? "bg-orange-100 text-orange-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>{inv.asset_type}</span>
                  </td>
                  <td className="py-2 text-right text-blue-600 font-medium">{fmt(inv.amount_invested)}</td>
                  <td className="py-2 text-right text-gray-600">{fmt(inv.current_value)}</td>
                  <td className={`py-2 text-right font-medium ${rend == null ? "text-gray-400" : rend >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {rend == null ? "—" : fmt(rend)}
                  </td>
                  <td className="py-2 text-gray-500 text-xs">{inv.notes}</td>
                  <td className="py-2">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button onClick={() => startEdit(inv)} className="text-blue-600 text-xs px-1">✏️</button>
                      <button onClick={() => handleDelete(inv.id)} className="text-red-600 text-xs px-1">🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
