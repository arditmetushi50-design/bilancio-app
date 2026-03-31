import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { searchMovimenti } from "../api/client";
import { getCategoryMeta } from "../utils/categories";

interface SearchResult {
  year: number;
  transactions: {
    id: number;
    year: number;
    month: number;
    category: { name: string };
    description: string;
    amount: number;
  }[];
}

const MESI = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function SearchBar({ variant }: { variant: "mobile" | "desktop" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await searchMovimenti(query.trim());
        setResults(data);
      } catch {
        setResults([]);
        setError(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleClose = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setError(false);
  };

  const handleGoTo = (year: number, month: number) => {
    handleClose();
    navigate(`/anno/${year}/mese/${month}`);
  };

  const triggerButton = (
    <button
      onClick={() => setOpen(true)}
      className={`flex items-center gap-2 transition-colors ${
        variant === "mobile"
          ? "w-8 h-8 justify-center rounded-full hover:bg-gray-100 text-gray-500"
          : "w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 border border-gray-200"
      }`}
      aria-label="Cerca"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      {variant === "desktop" && <span>Cerca movimenti...</span>}
    </button>
  );

  return (
    <>
      {triggerButton}

      {open && (
        <div className="fixed inset-0 z-[60] bg-white md:bg-black/50 md:flex md:items-start md:justify-center md:pt-20 animate-fade-in">
          <div className="w-full md:max-w-lg md:bg-white md:rounded-2xl md:shadow-xl md:max-h-[70vh] md:overflow-hidden flex flex-col h-full md:h-auto">
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
              <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                className="flex-1 text-base outline-none bg-transparent placeholder:text-gray-400"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca movimenti..."
              />
              <button
                onClick={handleClose}
                className="text-sm text-blue-600 font-medium shrink-0"
              >
                Chiudi
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading && (
                <p className="text-sm text-gray-400 text-center py-8">Ricerca...</p>
              )}
              {!loading && error && (
                <p className="text-sm text-red-500 text-center py-8">Errore nella ricerca</p>
              )}
              {!loading && !error && query.trim() && results.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Nessun risultato per "{query}"</p>
              )}
              {!loading && results.map((group) => (
                <div key={group.year} className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group.year}</h3>
                  <div className="space-y-1">
                    {group.transactions.map((tx) => {
                      const meta = getCategoryMeta(tx.category?.name ?? "");
                      return (
                        <button
                          key={tx.id}
                          onClick={() => handleGoTo(tx.year, tx.month)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors"
                        >
                          <span className="text-xl">{meta.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                            <p className="text-xs text-gray-400">{MESI[tx.month]} {tx.year} &middot; {tx.category?.name}</p>
                          </div>
                          <span className={`text-sm font-semibold ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {fmt(tx.amount)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!query.trim() && (
                <p className="text-sm text-gray-400 text-center py-8">Digita per cercare tra i movimenti</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
