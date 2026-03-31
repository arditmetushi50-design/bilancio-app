import { useEffect, useState } from "react";
import { getYearSummary, YearSummary } from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import { useYears } from "../hooks/useYears";

const MESI_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function fmtCell(n: number) {
  return fmt.format(n);
}

export default function TabellaAnnualePage() {
  const anni = useYears();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [summary, setSummary] = useState<YearSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getYearSummary(year)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [year]);

  // Build a lookup: monthIndex (1-12) -> category -> amount
  const monthData: Record<number, Record<string, number>> = {};
  if (summary) {
    for (const ms of summary.months) {
      monthData[ms.month] = ms.by_category;
    }
  }

  // Derive categories dynamically from the data (sorted, all categories present in the year)
  const CATEGORIES: string[] = [];
  if (summary) {
    const catSet = new Set<string>();
    for (const ms of summary.months) {
      Object.keys(ms.by_category).forEach((c) => catSet.add(c));
    }
    CATEGORIES.push(...Array.from(catSet).sort());
  }

  // Get value for a category in a specific month
  const getVal = (cat: string, month: number): number => {
    return monthData[month]?.[cat] ?? 0;
  };

  // Row total for a category across all months
  const rowTotal = (cat: string): number => {
    let sum = 0;
    for (let m = 1; m <= 12; m++) sum += getVal(cat, m);
    return sum;
  };

  // Column total for a month across all categories
  const colTotal = (month: number): number => {
    let sum = 0;
    for (const cat of CATEGORIES) sum += getVal(cat, month);
    return sum;
  };

  // Grand total
  const grandTotal = (): number => {
    let sum = 0;
    for (const cat of CATEGORIES) sum += rowTotal(cat);
    return sum;
  };

  const cellColor = (val: number) => {
    if (val > 0) return "text-green-600 dark:text-green-400";
    if (val < 0) return "text-red-600 dark:text-red-400";
    return "text-gray-400 dark:text-gray-500";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Tabella Annuale
        </h1>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Anno:
          </label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {anni.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500 py-10 text-center">
          Caricamento...
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-700 text-left px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 min-w-[180px]">
                    Categoria
                  </th>
                  {MESI_SHORT.map((m, i) => (
                    <th
                      key={i}
                      className="text-right px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 whitespace-nowrap"
                    >
                      {m}
                    </th>
                  ))}
                  <th className="text-right px-3 py-2.5 font-bold text-gray-800 dark:text-gray-100 border-b border-l border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-600/50 whitespace-nowrap">
                    Totale
                  </th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((cat) => {
                  const meta = getCategoryMeta(cat);
                  const total = rowTotal(cat);
                  return (
                    <tr
                      key={cat}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-3 py-2 border-b border-gray-100 dark:border-gray-700 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                        <span className="mr-1.5">{meta.icon}</span>
                        {cat}
                      </td>
                      {MESI_SHORT.map((_, i) => {
                        const val = getVal(cat, i + 1);
                        return (
                          <td
                            key={i}
                            className={`text-right px-3 py-2 border-b border-gray-100 dark:border-gray-700 tabular-nums ${cellColor(val)}`}
                          >
                            {val !== 0 ? fmtCell(val) : "—"}
                          </td>
                        );
                      })}
                      <td
                        className={`text-right px-3 py-2 border-b border-l border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 font-semibold tabular-nums ${cellColor(total)}`}
                      >
                        {total !== 0 ? fmtCell(total) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 dark:bg-gray-700/60 font-bold">
                  <td className="sticky left-0 z-10 bg-gray-100 dark:bg-gray-700 px-3 py-2.5 text-gray-800 dark:text-gray-100 border-t-2 border-gray-300 dark:border-gray-500">
                    Totale
                  </td>
                  {MESI_SHORT.map((_, i) => {
                    const val = colTotal(i + 1);
                    return (
                      <td
                        key={i}
                        className={`text-right px-3 py-2.5 border-t-2 border-gray-300 dark:border-gray-500 tabular-nums ${cellColor(val)}`}
                      >
                        {fmtCell(val)}
                      </td>
                    );
                  })}
                  <td
                    className={`text-right px-3 py-2.5 border-t-2 border-l border-gray-300 dark:border-gray-500 bg-gray-200 dark:bg-gray-600/60 tabular-nums ${cellColor(grandTotal())}`}
                  >
                    {fmtCell(grandTotal())}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
