import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getYearSummary, YearSummary } from "../api/client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const PIE_COLORS = ["#7c3aed", "#ea580c", "#0284c7", "#16a34a", "#dc2626",
  "#ca8a04", "#0d9488", "#be185d", "#2563eb", "#9333ea", "#b45309", "#64748b"];

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function AnnoPage() {
  const { year } = useParams<{ year: string }>();
  const y = Number(year);
  const [summary, setSummary] = useState<YearSummary | null>(null);

  useEffect(() => {
    getYearSummary(y).then(setSummary);
  }, [y]);

  if (!summary) return <div className="text-gray-400 dark:text-gray-500 py-10 text-center">Caricamento...</div>;

  const categoryTotals: Record<string, number> = {};
  for (const ms of summary.months) {
    for (const [cat, val] of Object.entries(ms.by_category)) {
      if (val < 0) {
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + Math.abs(val);
      }
    }
  }
  const pieData = Object.entries(categoryTotals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-blue-600 hover:underline text-sm">← Dashboard</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bilancio {y}</h1>
      </div>

      {/* Totali anno */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card border-l-4 border-l-green-500">
          <p className="text-xs text-gray-500 dark:text-gray-400">Entrate Totali</p>
          <p className="text-xl font-bold text-green-600">{fmt(summary.total_entrate)}</p>
        </div>
        <div className="card border-l-4 border-l-red-500">
          <p className="text-xs text-gray-500 dark:text-gray-400">Uscite Totali</p>
          <p className="text-xl font-bold text-red-600">{fmt(Math.abs(summary.total_uscite))}</p>
        </div>
        <div className="card border-l-4 border-l-blue-500">
          <p className="text-xs text-gray-500 dark:text-gray-400">Risparmio Totale</p>
          <p className={`text-xl font-bold ${summary.risparmio >= 0 ? "text-blue-600" : "text-orange-600"}`}>
            {fmt(summary.risparmio)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Mesi tabella */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Riepilogo mensile</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-1 text-gray-500 dark:text-gray-400">Mese</th>
                <th className="text-right py-1 text-green-600">Entrate</th>
                <th className="text-right py-1 text-red-600">Uscite</th>
                <th className="text-right py-1 text-blue-600">Risparmio</th>
              </tr>
            </thead>
            <tbody>
              {summary.months.map((ms, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-1.5">
                    <Link to={`/anno/${y}/mese/${ms.month}`} className="text-blue-600 hover:underline">
                      {MESI[i + 1]}
                    </Link>
                  </td>
                  <td className="text-right text-green-600">{ms.total_entrate > 0 ? fmt(ms.total_entrate) : "-"}</td>
                  <td className="text-right text-red-600">{ms.total_uscite < 0 ? fmt(ms.total_uscite) : "-"}</td>
                  <td className={`text-right font-medium ${ms.risparmio >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                    {ms.total_entrate > 0 || ms.total_uscite < 0 ? fmt(ms.risparmio) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Torta categorie uscite */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Distribuzione uscite per categoria</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name">
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => v != null ? fmt(Number(v)) : ""} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Nessuna uscita registrata</p>
          )}
        </div>
      </div>
    </div>
  );
}
