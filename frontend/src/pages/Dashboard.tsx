import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAnni, getYearSummary, getMonthSummary, YearSummary, MonthSummary } from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

const MESI_FULL = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function Dashboard() {
  const now = new Date();
  const [anni, setAnni] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [summary, setSummary] = useState<YearSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [curMonth, setCurMonth] = useState<MonthSummary | null>(null);

  useEffect(() => {
    // Load current month summary for the top widget
    getMonthSummary(now.getFullYear(), now.getMonth() + 1)
      .then(setCurMonth)
      .catch(() => {});
  }, []);

  useEffect(() => {
    getAnni().then((a) => {
      setAnni(a);
      if (a.length > 0) setSelectedYear(a[a.length - 1]);
    });
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    getYearSummary(selectedYear)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [selectedYear]);

  const chartData = summary?.months.map((m, i) => ({
    name: MESI[i],
    Entrate: m.total_entrate,
    Uscite: Math.abs(m.total_uscite),
    Risparmio: m.risparmio,
  })) ?? [];

  // Aggregate category spending across the year for donut chart
  const categoryTotals: Record<string, number> = {};
  if (summary) {
    for (const month of summary.months) {
      if (month.by_category) {
        for (const [cat, amount] of Object.entries(month.by_category)) {
          const absAmt = Math.abs(amount);
          if (absAmt > 0 && amount < 0) {
            categoryTotals[cat] = (categoryTotals[cat] ?? 0) + absAmt;
          }
        }
      }
    }
  }

  const donutData = Object.entries(categoryTotals)
    .filter(([, val]) => val > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name,
      value: Math.round(value * 100) / 100,
      meta: getCategoryMeta(name),
    }));

  const totalExpenses = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Mese corrente widget ── */}
      {curMonth && (
        <Link
          to={`/anno/${now.getFullYear()}/mese/${now.getMonth() + 1}`}
          className="block card mb-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium opacity-80 mb-1">{MESI_FULL[now.getMonth()]} {now.getFullYear()} — tocca per il dettaglio</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold">{fmt(Math.abs(curMonth.total_uscite))}</p>
                <p className="text-sm opacity-75">spese</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-75 mb-1">Risparmio</p>
              <p className={`text-xl font-bold ${curMonth.risparmio >= 0 ? "text-green-200" : "text-red-200"}`}>
                {fmt(curMonth.risparmio)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-4 text-xs opacity-80">
            <span>▲ Entrate: {fmt(curMonth.total_entrate)}</span>
            <span>▼ Spese fisse: {fmt(Math.abs(curMonth.spese_fisse))}</span>
          </div>
        </Link>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Riepilogo annuale</p>
        </div>
        {/* Selettore anno - scroll orizzontale su mobile */}
        <div className="flex gap-1.5 overflow-x-auto max-w-[55vw] pb-1">
          {anni.map((a) => (
            <button
              key={a}
              onClick={() => setSelectedYear(a)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                a === selectedYear
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Caricamento...</div>
      ) : !summary ? (
        <div className="card text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">📂</p>
          <p className="font-medium">Nessun dato trovato.</p>
          <p className="text-sm mt-1">
            <Link to="/import" className="text-blue-600 underline">Importa il tuo Excel storico</Link> per iniziare.
          </p>
        </div>
      ) : (
        <>
          {/* Totali anno */}
          <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4">
            <div className="card border-l-4 border-l-green-500 p-3 md:p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">
                Entrate
              </p>
              <p className="text-sm md:text-2xl font-bold text-green-600 mt-1">{fmt(summary.total_entrate)}</p>
            </div>
            <div className="card border-l-4 border-l-red-500 p-3 md:p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">
                Uscite
              </p>
              <p className="text-sm md:text-2xl font-bold text-red-600 mt-1">{fmt(Math.abs(summary.total_uscite))}</p>
            </div>
            <div className={`card border-l-4 p-3 md:p-4 ${summary.risparmio >= 0 ? "border-l-blue-500" : "border-l-orange-500"}`}>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">
                Risparmio
              </p>
              <p className={`text-sm md:text-2xl font-bold mt-1 ${summary.risparmio >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                {fmt(summary.risparmio)}
              </p>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="card mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Andamento mensile {selectedYear}</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `\u20AC${v}`} width={48} />
                <Tooltip formatter={(v) => v != null ? fmt(Number(v)) : ""} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Entrate" fill="#16a34a" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Uscite" fill="#dc2626" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Risparmio" fill="#0284c7" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Donut Chart - Expense Distribution */}
          {donutData.length > 0 && (
            <div className="card mb-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Distribuzione spese {selectedYear}</h2>
              <div className="flex flex-col md:flex-row items-center gap-4">
                <ResponsiveContainer width="100%" height={220} className="md:max-w-[280px]">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {donutData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.meta.hex} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => fmt(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="flex-1 w-full">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {donutData.map((d) => {
                      const pct = totalExpenses > 0 ? ((d.value / totalExpenses) * 100).toFixed(1) : "0";
                      return (
                        <div key={d.name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                          <span className="text-base">{d.meta.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{d.name}</p>
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${pct}%`, backgroundColor: d.meta.hex }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-500 font-medium w-8 text-right">{pct}%</span>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{fmt(d.value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Griglia mesi */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
            {summary.months.map((m, i) => (
              <Link
                key={i}
                to={`/anno/${selectedYear}/mese/${m.month}`}
                className="card hover:shadow-md transition-shadow p-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{MESI[i]}</span>
                  <span className={`text-xs font-bold ${m.risparmio >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                    {fmt(m.risparmio)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span className="text-green-600">+{fmt(m.total_entrate)}</span>
                  <span className="text-red-600">{fmt(m.total_uscite)}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full"
                    style={{
                      width: `${m.total_entrate > 0
                        ? Math.min(100, (m.risparmio / m.total_entrate) * 100)
                        : 0}%`,
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
