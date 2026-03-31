import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getYearSummary, type YearSummary } from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import { useYears } from "../hooks/useYears";

const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const eurFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

export default function TrendPage() {
  const anni = useYears();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [yearData, setYearData] = useState<YearSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set());

  // Load year summary when year changes
  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    getYearSummary(selectedYear)
      .then(setYearData)
      .finally(() => setLoading(false));
  }, [selectedYear]);

  // Collect all expense categories from the data
  const allCategories = useMemo(() => {
    if (!yearData) return [];
    const catSet = new Set<string>();
    yearData.months.forEach((m) => {
      Object.keys(m.by_category).forEach((c) => catSet.add(c));
    });
    // Exclude income categories from the category filter
    const incomeNames = new Set(["STIPENDIO", "CONTRIBUTO MOGLIE", "ALTRE ENTRATE"]);
    return Array.from(catSet)
      .filter((c) => !incomeNames.has(c.toUpperCase()))
      .sort();
  }, [yearData]);

  // Build chart data: one entry per month
  const chartData = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => {
      const monthNum = idx + 1;
      const m = yearData?.months.find((ms) => ms.month === monthNum);
      const row: Record<string, number | string> = { mese: name };
      row["Entrate"] = m?.total_entrate ?? 0;
      row["Uscite"] = m?.total_uscite ?? 0;
      row["Risparmio"] = m?.risparmio ?? 0;

      // Add enabled category columns
      enabledCategories.forEach((cat) => {
        row[cat] = m?.by_category[cat] ?? 0;
      });

      return row;
    });
  }, [yearData, enabledCategories]);

  const toggleCategory = (cat: string) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className="card p-3 text-sm shadow-lg">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.dataKey} style={{ color: entry.color }}>
            {entry.name}: {eurFormatter.format(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold dark:text-gray-100">Andamento Spese</h1>
        <select
          className="border rounded-lg px-4 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
        >
          {anni.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Main chart */}
      <div className="card p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">
          Riepilogo Mensile {selectedYear}
        </h2>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500 dark:text-gray-400">Caricamento...</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="mese" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v: number) => eurFormatter.format(v)}
                tick={{ fontSize: 11 }}
                width={90}
                domain={[0, 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />

              {/* Default lines */}
              <Line
                type="monotone"
                dataKey="Entrate"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Uscite"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Risparmio"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />

              {/* Category lines */}
              {Array.from(enabledCategories).map((cat) => (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stroke={getCategoryMeta(cat).hex}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Category filter */}
      <div className="card p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-3 dark:text-gray-100">
          Filtra per Categoria
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Seleziona le categorie di spesa per visualizzarne l'andamento mensile.
        </p>
        {allCategories.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            Nessuna categoria disponibile per quest'anno.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allCategories.map((cat) => {
              const meta = getCategoryMeta(cat);
              const active = enabledCategories.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`
                    px-3 py-1.5 rounded-full text-sm font-medium transition-all
                    border-2
                    ${
                      active
                        ? "text-white border-transparent"
                        : "bg-transparent border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500"
                    }
                  `}
                  style={active ? { backgroundColor: meta.hex, borderColor: meta.hex } : {}}
                >
                  {meta.icon} {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
