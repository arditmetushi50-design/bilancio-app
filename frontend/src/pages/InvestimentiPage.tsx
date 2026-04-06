import { useEffect, useState } from "react";
import {
  getInvestimenti, createInvestimento, updateInvestimento, deleteInvestimento,
  getRiepilogoInvestimenti, Investment
} from "../api/client";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

const ASSET_TYPES = ["Crypto", "ETF", "Azioni", "Altro"];

const TYPE_META: Record<string, { color: string; hex: string; icon: string }> = {
  Crypto:  { color: "bg-orange-100 text-orange-700", hex: "#f97316", icon: "₿" },
  ETF:     { color: "bg-blue-100 text-blue-700",     hex: "#3b82f6", icon: "📈" },
  Azioni:  { color: "bg-purple-100 text-purple-700", hex: "#a855f7", icon: "🏢" },
  Altro:   { color: "bg-gray-100 text-gray-700",     hex: "#9ca3af", icon: "💼" },
};

const PLATFORM_COLORS = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#ec4899", "#eab308"];

export default function InvestimentiPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [riepilogo, setRiepilogo] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
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
    // Auto-expand first group
    if (invs.length > 0 && !expandedGroup) {
      const platforms = [...new Set(invs.map(i => i.asset))];
      setExpandedGroup(platforms[0]);
    }
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Eliminare questo investimento?")) return;
    await deleteInvestimento(id);
    await reload();
  };

  // ── Dati per grafici ──────────────────────────────────────────────────────

  // Per tipo (Crypto / ETF / …)
  const byType: Record<string, number> = {};
  for (const inv of investments) {
    byType[inv.asset_type] = (byType[inv.asset_type] ?? 0) + inv.amount_invested;
  }
  const typeData = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  // Per piattaforma (Binance / Scalable / …)
  const byPlatform: Record<string, { invested: number; current: number; count: number; type: string }> = {};
  for (const inv of investments) {
    if (!byPlatform[inv.asset]) {
      byPlatform[inv.asset] = { invested: 0, current: 0, count: 0, type: inv.asset_type };
    }
    byPlatform[inv.asset].invested += inv.amount_invested;
    if (inv.current_value) byPlatform[inv.asset].current += inv.current_value;
    byPlatform[inv.asset].count += 1;
  }
  const platformData = Object.entries(byPlatform)
    .sort((a, b) => b[1].invested - a[1].invested)
    .map(([name, d]) => ({ name, ...d, invested: Math.round(d.invested * 100) / 100 }));

  const totalInvested = investments.reduce((s, i) => s + i.amount_invested, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Investimenti</h1>
        <button
          className="btn-primary text-sm"
          onClick={() => { resetForm(); setEditingId(null); setShowForm(!showForm); }}
        >
          {showForm ? "✕ Annulla" : "+ Nuovo"}
        </button>
      </div>

      {/* ── Form ── */}
      {showForm && (
        <div className="card border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10">
          <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-100 mb-3">
            {editingId ? "Modifica investimento" : "Nuovo investimento"}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Data</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Piattaforma / Asset</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                placeholder="Binance, Scalable, Crypto.com…"
                value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })}>
                {ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Capitale investito (€)</label>
              <input type="number" step="0.01" min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                value={form.amount_invested} onChange={(e) => setForm({ ...form, amount_invested: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Valore attuale (€) — opzionale</label>
              <input type="number" step="0.01" min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
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

      {/* ── Riepilogo ── */}
      {riepilogo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card border-l-4 border-l-blue-500 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Capitale investito</p>
            <p className="text-lg font-bold text-blue-600">{fmt(riepilogo.total_invested)}</p>
          </div>
          <div className="card border-l-4 border-l-green-500 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Valore attuale</p>
            <p className="text-lg font-bold text-green-600">
              {riepilogo.total_current_value > 0 ? fmt(riepilogo.total_current_value) : "—"}
            </p>
          </div>
          <div className="card border-l-4 border-l-purple-500 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Rendimento €</p>
            <p className={`text-lg font-bold ${(riepilogo.rendimento_euro ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {riepilogo.rendimento_euro != null ? fmt(riepilogo.rendimento_euro) : "—"}
            </p>
          </div>
          <div className="card border-l-4 border-l-orange-500 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Rendimento %</p>
            <p className={`text-lg font-bold ${(riepilogo.rendimento_pct ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {riepilogo.rendimento_pct != null ? `${riepilogo.rendimento_pct.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
      )}

      {investments.length > 0 && (
        <>
          {/* ── Grafici ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Torta per tipo */}
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Per tipo</h2>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={typeData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={3} dataKey="value">
                      {typeData.map((entry) => (
                        <Cell key={entry.name} fill={TYPE_META[entry.name]?.hex ?? "#9ca3af"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {typeData.map((d) => {
                    const meta = TYPE_META[d.name] ?? TYPE_META.Altro;
                    const pct = totalInvested > 0 ? ((d.value / totalInvested) * 100).toFixed(1) : "0";
                    return (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.icon} {d.name}</span>
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.hex }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 w-16 text-right">{fmt(d.value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Barre per piattaforma */}
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Per piattaforma</h2>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={platformData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => `€${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="invested" radius={[0, 4, 4, 0]}>
                    {platformData.map((entry, idx) => (
                      <Cell key={entry.name} fill={PLATFORM_COLORS[idx % PLATFORM_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Lista raggruppata per piattaforma ── */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Dettaglio per piattaforma</h2>
            {platformData.map((platform, idx) => {
              const platformInvs = investments.filter(i => i.asset === platform.name);
              const isOpen = expandedGroup === platform.name;
              const meta = TYPE_META[platform.type] ?? TYPE_META.Altro;
              const pct = totalInvested > 0 ? ((platform.invested / totalInvested) * 100).toFixed(1) : "0";

              return (
                <div key={platform.name} className="card overflow-hidden p-0">
                  {/* Intestazione gruppo */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                    onClick={() => setExpandedGroup(isOpen ? null : platform.name)}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[idx % PLATFORM_COLORS.length] }}
                    />
                    <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 flex-1">{platform.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.icon} {platform.type}</span>
                    <span className="text-xs text-gray-400">{platform.count} versamenti</span>
                    <span className="text-sm font-bold text-blue-600 w-24 text-right">{fmt(platform.invested)}</span>
                    <span className="text-xs text-gray-400">{pct}%</span>
                    <span className="text-gray-400 text-xs ml-1">{isOpen ? "▲" : "▼"}</span>
                  </button>

                  {/* Righe versamenti */}
                  {isOpen && (
                    <div className="border-t border-gray-100 dark:border-gray-700">
                      {platformInvs.map((inv) => {
                        const rend = inv.current_value != null ? inv.current_value - inv.amount_invested : null;
                        return (
                          <div key={inv.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 group border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                            <span className="text-xs text-gray-400 w-20 shrink-0">{inv.date}</span>
                            <span className="flex-1 text-xs text-gray-500 dark:text-gray-400 truncate">{inv.notes || "—"}</span>
                            <span className="text-xs font-semibold text-blue-600 w-20 text-right">{fmt(inv.amount_invested)}</span>
                            {inv.current_value != null ? (
                              <span className={`text-xs font-semibold w-20 text-right ${rend! >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {rend! >= 0 ? "+" : ""}{fmt(rend)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 w-20 text-right">—</span>
                            )}
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => startEdit(inv)} className="text-blue-500 text-xs px-1 hover:text-blue-700">✏️</button>
                              <button onClick={() => handleDelete(inv.id)} className="text-red-400 text-xs px-1 hover:text-red-600">🗑</button>
                            </div>
                          </div>
                        );
                      })}
                      {/* Subtotale */}
                      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-700/50">
                        <span className="flex-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Totale {platform.name}</span>
                        <span className="text-xs font-bold text-blue-600 w-20 text-right">{fmt(platform.invested)}</span>
                        {platform.current > 0 ? (
                          <span className={`text-xs font-bold w-20 text-right ${platform.current >= platform.invested ? "text-green-600" : "text-red-600"}`}>
                            {platform.current >= platform.invested ? "+" : ""}{fmt(platform.current - platform.invested)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 w-20 text-right">—</span>
                        )}
                        <div className="w-8" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {investments.length === 0 && !showForm && (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📈</p>
          <p className="font-medium text-gray-600 dark:text-gray-300">Nessun investimento registrato</p>
          <p className="text-sm mt-1">Aggiungi il tuo primo investimento con il pulsante in alto</p>
        </div>
      )}
    </div>
  );
}
