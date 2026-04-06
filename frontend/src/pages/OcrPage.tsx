import { useState, useEffect } from "react";
import {
  uploadOcr, createMovimento, getCategories, checkOcrDuplicates,
  OcrResult, OcrTransactionItem, Category, DuplicateError,
} from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import { useToast } from "../components/Toast";
import { useYears } from "../hooks/useYears";
import axios from "axios";

const MESI = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
const MESI_FULL = ["","Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                   "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const INCOME_TYPES = new Set(["ENTRATA"]);

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

// ─── Multi-transaction types ─────────────────────────────────────────────────
interface MultiRow {
  key: number;
  description: string;
  amount: number;
  year: number;
  month: number;
  category_id: number | null;
  proposed_category: string;
  confidence: number;
  status: "pending" | "saving" | "saved" | "duplicate" | "error" | "skipped";
  is_duplicate?: boolean;
  dup_existing?: string;
}

export default function OcrPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // ── Stato modalità singola ──────────────────────────────────────────────
  const [amount, setAmount] = useState("");
  const [sign, setSign] = useState<"neg" | "pos">("neg");
  const [description, setDescription] = useState("");
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1);
  const [showRawText, setShowRawText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState("");

  // Duplicate modal (modalità singola)
  const [dupInfo, setDupInfo] = useState<DuplicateError | null>(null);
  const [pendingSave, setPendingSave] = useState<null | (() => void)>(null);

  // ── Stato modalità multi ────────────────────────────────────────────────
  const [multiRows, setMultiRows] = useState<MultiRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
  const [savingMulti, setSavingMulti] = useState(false);
  const [multiDone, setMultiDone] = useState(0);
  const [checkingDups, setCheckingDups] = useState(false);

  const years = useYears();

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  // ── Caricamento immagine ─────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setLoading(true);
    setResult(null);
    setMultiRows([]);
    try {
      const res = await uploadOcr(file, hint);
      setResult(res);

      if (res.mode === "multi" && res.transactions && res.transactions.length > 0) {
        await initMultiRows(res.transactions);
      } else {
        // Modalità singola
        if (res.amount != null) {
          setAmount(String(Math.abs(res.amount)));
          const proposedCat = categories.find(c => c.name === res.proposed_category);
          setSign(proposedCat && INCOME_TYPES.has(proposedCat.type) ? "pos" : "neg");
        }
        setDescription(hint.trim() || res.description || "");
        if (res.year_hint) setSelYear(res.year_hint);
        if (res.month_hint) setSelMonth(res.month_hint);
        if (res.proposed_category) {
          const cat = categories.find(c => c.name === res.proposed_category);
          if (cat) setSelectedCatId(cat.id);
        }
      }
    } catch {
      showToast("Errore nell'elaborazione dell'immagine", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Inizializza righe multi + check duplicati ────────────────────────────
  const initMultiRows = async (txs: OcrTransactionItem[]) => {
    const rows: MultiRow[] = txs.map((tx, i) => {
      const cat = categories.find(c => c.name === tx.proposed_category);
      return {
        key: i,
        description: tx.description,
        amount: tx.amount,
        year: tx.year,
        month: tx.month,
        category_id: cat?.id ?? null,
        proposed_category: tx.proposed_category,
        confidence: tx.confidence,
        status: "pending",
      };
    });
    setMultiRows(rows);
    // Seleziona tutto di default
    setSelectedKeys(new Set(rows.map(r => r.key)));
    setMultiDone(0);

    // Controlla duplicati in background
    setCheckingDups(true);
    try {
      const dupChecks = await checkOcrDuplicates(
        rows.map(r => ({ description: r.description, amount: r.amount, year: r.year, month: r.month }))
      );
      setMultiRows(prev => prev.map(r => {
        const check = dupChecks.find(d => d.index === r.key);
        return check
          ? { ...r, is_duplicate: check.is_duplicate, dup_existing: check.existing_description ?? undefined }
          : r;
      }));
    } catch {
      // ignora errori check duplicati
    } finally {
      setCheckingDups(false);
    }
  };

  // ── Salvataggio bulk (multi) ─────────────────────────────────────────────
  const handleSaveMulti = async (force = false) => {
    const toSave = multiRows.filter(r => selectedKeys.has(r.key) && r.status === "pending");
    if (toSave.length === 0) { showToast("Nessuna transazione selezionata", "error"); return; }

    setSavingMulti(true);
    let done = 0;

    for (const row of toSave) {
      if (!row.category_id) {
        setMultiRows(prev => prev.map(r => r.key === row.key ? { ...r, status: "error" } : r));
        done++;
        setMultiDone(done);
        continue;
      }
      setMultiRows(prev => prev.map(r => r.key === row.key ? { ...r, status: "saving" } : r));
      try {
        await createMovimento({
          year: row.year, month: row.month,
          category_id: row.category_id,
          description: row.description,
          amount: row.amount,
          source: "ocr",
          ocr_proposed_category: row.proposed_category,
        }, force || !row.is_duplicate);
        setMultiRows(prev => prev.map(r => r.key === row.key ? { ...r, status: "saved" } : r));
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          setMultiRows(prev => prev.map(r => r.key === row.key ? { ...r, status: "duplicate", is_duplicate: true } : r));
        } else {
          setMultiRows(prev => prev.map(r => r.key === row.key ? { ...r, status: "error" } : r));
        }
      }
      done++;
      setMultiDone(done);
    }

    setSavingMulti(false);
    showToast(`Salvate ${done} transazioni`);
  };

  // ── Salvataggio singolo ──────────────────────────────────────────────────
  const doSave = async (force = false) => {
    if (!selectedCatId) { showToast("Seleziona una categoria", "error"); return; }
    if (!amount || parseFloat(amount) === 0) { showToast("Inserisci un importo", "error"); return; }
    const desc = description.trim() || hint.trim() || "Scontrino";
    setSaving(true);
    try {
      await createMovimento({
        year: selYear, month: selMonth, category_id: selectedCatId,
        description: desc,
        amount: sign === "neg" ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount)),
        source: "ocr",
        ocr_raw_text: result?.raw_text,
        ocr_confidence: result?.confidence,
        ocr_proposed_category: result?.proposed_category,
      }, force);
      showToast("Movimento salvato!");
      setResult(null); setAmount(""); setDescription(""); setSelectedCatId(null); setHint("");
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setDupInfo(err.response.data?.detail as DuplicateError);
        setPendingSave(() => () => doSave(true));
      } else {
        showToast("Errore nel salvataggio", "error");
      }
    } finally { setSaving(false); }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const filteredCats = categories.filter(c =>
    sign === "neg" ? c.type === "SPESA_FISSA" || c.type === "SPESA_VARIABILE" : c.type === "ENTRATA"
  );
  const confPerc = result ? Math.round(result.confidence) : 0;
  const lowConfidence = confPerc < 60;
  const isMulti = result?.mode === "multi";

  // ── Multi row helpers ────────────────────────────────────────────────────
  const updateRow = (key: number, patch: Partial<MultiRow>) =>
    setMultiRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));

  const toggleSelect = (key: number) =>
    setSelectedKeys(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });

  const toggleAll = () =>
    setSelectedKeys(prev =>
      prev.size === multiRows.length ? new Set() : new Set(multiRows.map(r => r.key))
    );

  const savedCount = multiRows.filter(r => r.status === "saved").length;
  const dupCount = multiRows.filter(r => r.status === "duplicate" || r.is_duplicate).length;
  const pendingCount = multiRows.filter(r => selectedKeys.has(r.key) && r.status === "pending").length;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Foto Scontrino / Estratto</h1>
      <p className="text-xs text-gray-500 mb-4">
        Scatta una foto di uno scontrino <strong>oppure</strong> di una schermata della tua app bancaria —
        l'AI estrae tutte le transazioni automaticamente
      </p>

      {/* ── ZONA UPLOAD ───────────────────────────────────────────────────── */}
      {!result && !loading && (
        <div className="space-y-3">
          <div className="card">
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block">
              💡 Descrizione (opzionale)
            </label>
            <input
              type="text"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
              value={hint}
              onChange={e => setHint(e.target.value)}
              placeholder='Es. "benzina", "spesa lidl", schermata carta...'
            />
          </div>

          <div
            className="card border-2 border-dashed border-gray-300 dark:border-gray-600 text-center py-8 cursor-pointer hover:border-blue-400 transition-colors"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <div className="text-5xl mb-3">📷</div>
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium mb-1">Scontrino o schermata app bancaria</p>
            <p className="text-gray-400 text-xs mb-5">
              Funziona con Revolut, Fineco, N26, Scalable, ecc.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center px-4">
              <label className="btn-primary text-sm py-3 px-6 cursor-pointer inline-block">
                📷 Fotocamera
                <input type="file" accept="image/*" capture="environment" onChange={handleFileInput} className="hidden" />
              </label>
              <label className="btn-ghost text-sm py-3 px-6 cursor-pointer inline-block">
                🖼 Galleria
                <input type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── CARICAMENTO ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="card text-center py-12">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-gray-700 dark:text-gray-300 font-semibold mb-1">Analisi in corso...</p>
          <p className="text-gray-400 text-sm">Estrazione transazioni e categorie</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           MODALITÀ MULTI — estratto conto
         ══════════════════════════════════════════════════════════════════════ */}
      {result && !loading && isMulti && (
        <div className="space-y-4">
          {/* Header risultato */}
          <div className="card bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏦</span>
              <div className="flex-1">
                <p className="font-bold text-blue-800 dark:text-blue-200 text-sm">
                  Estratto conto rilevato — {multiRows.length} transazioni trovate
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">
                  {checkingDups ? "Controllo duplicati in corso..." : `${dupCount} possibili duplicati · Selezionati: ${selectedKeys.size}`}
                </p>
              </div>
              <button
                onClick={() => { setResult(null); setMultiRows([]); setHint(""); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >Nuova foto</button>
            </div>
          </div>

          {/* Barra azioni */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleAll}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {selectedKeys.size === multiRows.length ? "Deseleziona tutto" : "Seleziona tutto"}
            </button>
            {savedCount > 0 && (
              <span className="text-xs text-green-600 font-semibold">✓ {savedCount} salvate</span>
            )}
            <div className="flex-1" />
            <button
              onClick={() => handleSaveMulti(false)}
              disabled={savingMulti || pendingCount === 0}
              className="btn-primary text-sm py-2 px-5 disabled:opacity-40"
            >
              {savingMulti
                ? `Salvataggio ${multiDone}/${multiRows.filter(r => selectedKeys.has(r.key) && r.status === "pending").length + multiDone}...`
                : `✓ Salva selezionate (${pendingCount})`}
            </button>
          </div>

          {/* Lista transazioni */}
          <div className="space-y-2">
            {multiRows.map(row => {
              const cat = categories.find(c => c.id === row.category_id);
              const isSelected = selectedKeys.has(row.key);
              const statusColor =
                row.status === "saved" ? "border-green-300 bg-green-50 dark:bg-green-900/10" :
                row.status === "duplicate" ? "border-orange-300 bg-orange-50 dark:bg-orange-900/10" :
                row.status === "error" ? "border-red-300 bg-red-50 dark:bg-red-900/10" :
                row.is_duplicate ? "border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10" :
                isSelected ? "border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800" :
                "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-50";

              return (
                <div key={row.key} className={`rounded-xl border p-3 transition-all ${statusColor}`}>
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    {row.status === "saved" ? (
                      <span className="text-xl mt-0.5 shrink-0">✅</span>
                    ) : row.status === "error" ? (
                      <span className="text-xl mt-0.5 shrink-0">❌</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => row.status === "pending" && toggleSelect(row.key)}
                        disabled={row.status !== "pending"}
                        className="mt-1 w-4 h-4 accent-blue-600 shrink-0 cursor-pointer"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Descrizione editabile — bordo visibile al hover/focus */}
                      <input
                        className="w-full text-sm font-medium text-gray-800 dark:text-gray-100 bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-gray-500 focus:border-blue-400 rounded px-1 py-0.5 mb-1 outline-none transition-colors"
                        value={row.description}
                        onChange={e => updateRow(row.key, { description: e.target.value })}
                        disabled={row.status !== "pending"}
                        title="Clicca per modificare il nome"
                      />

                      {/* Data + Categoria */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">
                          {MESI_FULL[row.month]} {row.year}
                        </span>
                        {row.is_duplicate && row.status === "pending" && (
                          <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full font-bold">
                            ⚠️ Duplicato
                          </span>
                        )}
                        {row.status === "saving" && (
                          <span className="text-[10px] text-blue-600 animate-pulse">Salvataggio...</span>
                        )}
                        {row.status === "duplicate" && (
                          <span className="text-[10px] text-orange-600 font-semibold">
                            Già presente —
                            <button
                              onClick={() => {
                                updateRow(row.key, { is_duplicate: false, status: "pending" });
                                // Forza salvataggio di questa riga
                                setTimeout(async () => {
                                  if (!row.category_id) return;
                                  updateRow(row.key, { status: "saving" });
                                  try {
                                    await createMovimento({
                                      year: row.year, month: row.month,
                                      category_id: row.category_id,
                                      description: row.description,
                                      amount: row.amount,
                                      source: "ocr",
                                      ocr_proposed_category: row.proposed_category,
                                    }, true);
                                    updateRow(row.key, { status: "saved" });
                                  } catch {
                                    updateRow(row.key, { status: "error" });
                                  }
                                }, 0);
                              }}
                              className="underline ml-1 hover:text-orange-800"
                            >salva comunque</button>
                          </span>
                        )}
                      </div>

                      {/* Selettore categoria */}
                      {row.status === "pending" && (
                        <select
                          className="mt-1.5 w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 dark:bg-gray-700 dark:text-gray-100"
                          value={row.category_id ?? ""}
                          onChange={e => updateRow(row.key, { category_id: Number(e.target.value) || null })}
                        >
                          <option value="">— Seleziona categoria —</option>
                          {categories.filter(c => c.type === "SPESA_FISSA" || c.type === "SPESA_VARIABILE" || c.type === "ENTRATA").map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                      {row.status !== "pending" && cat && (
                        <span className="text-xs text-gray-500 mt-0.5 block">{cat.name}</span>
                      )}
                    </div>

                    {/* Importo editabile + bottone elimina */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {row.status === "pending" ? (
                        <input
                          type="number"
                          step="0.01"
                          className={`w-24 text-right text-sm font-bold border border-transparent hover:border-gray-300 dark:hover:border-gray-500 focus:border-blue-400 rounded px-1 py-0.5 outline-none bg-transparent transition-colors ${row.amount >= 0 ? "text-green-600" : "text-red-600"}`}
                          value={Math.abs(row.amount)}
                          onChange={e => {
                            const v = parseFloat(e.target.value) || 0;
                            updateRow(row.key, { amount: row.amount < 0 ? -v : v });
                          }}
                          title="Clicca per modificare l'importo"
                        />
                      ) : (
                        <p className={`text-sm font-bold ${row.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(row.amount)}
                        </p>
                      )}
                      {row.confidence < 60 && row.status === "pending" && (
                        <p className="text-[9px] text-orange-500">Verifica cat.</p>
                      )}
                      {/* Bottone elimina riga */}
                      {row.status === "pending" && (
                        <button
                          onClick={() => {
                            setMultiRows(prev => prev.filter(r => r.key !== row.key));
                            setSelectedKeys(prev => { const s = new Set(prev); s.delete(row.key); return s; });
                          }}
                          className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
                          title="Rimuovi questa voce"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer pulsante basso */}
          {pendingCount > 0 && (
            <button
              onClick={() => handleSaveMulti(false)}
              disabled={savingMulti}
              className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold text-base hover:bg-blue-700 disabled:opacity-50"
            >
              {savingMulti ? "Salvataggio in corso..." : `✓ Salva ${pendingCount} transazioni selezionate`}
            </button>
          )}
          {savedCount === multiRows.length && multiRows.length > 0 && (
            <div className="card text-center py-4 bg-green-50 dark:bg-green-900/20 border border-green-200">
              <p className="text-green-700 dark:text-green-300 font-semibold">
                ✅ Tutte le transazioni salvate!
              </p>
              <button
                onClick={() => { setResult(null); setMultiRows([]); setHint(""); }}
                className="mt-2 text-sm text-blue-600 underline"
              >Carica un altro estratto</button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           MODALITÀ SINGOLA — scontrino
         ══════════════════════════════════════════════════════════════════════ */}
      {result && !loading && !isMulti && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                confPerc >= 70 ? "bg-green-100 text-green-700" :
                confPerc >= 50 ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              }`}>
                {confPerc >= 70 ? "✓ Alta" : confPerc >= 50 ? "~ Media" : "? Bassa"} ({confPerc}%)
              </span>
              {hint && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">📌 {hint}</span>
              )}
            </div>
            <button onClick={() => setShowRawText(!showRawText)} className="text-xs text-gray-400 underline">
              {showRawText ? "Nascondi" : "Testo OCR"}
            </button>
          </div>

          {lowConfidence && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl px-4 py-3 flex gap-3">
              <span className="text-xl">🤔</span>
              <div>
                <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">Non sono sicuro della categoria</p>
                <p className="text-xs text-orange-600 dark:text-orange-300 mt-0.5">Seleziona manualmente la categoria corretta.</p>
              </div>
            </div>
          )}

          {showRawText && (
            <div className="card bg-gray-50 dark:bg-gray-800">
              <p className="text-xs text-gray-500 mb-1 font-medium">Testo estratto:</p>
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                {result.raw_text || "(nessun testo rilevato)"}
              </pre>
            </div>
          )}

          <div className="card space-y-4">
            <div className="flex rounded-xl bg-gray-100 dark:bg-gray-700 p-1">
              <button
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${sign === "neg" ? "bg-red-500 text-white shadow" : "text-gray-500"}`}
                onClick={() => setSign("neg")}
              >− Uscita</button>
              <button
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${sign === "pos" ? "bg-green-500 text-white shadow" : "text-gray-500"}`}
                onClick={() => setSign("pos")}
              >+ Entrata</button>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Importo</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-400">€</span>
                <input
                  type="number" step="0.01"
                  className={`w-full border rounded-xl pl-8 pr-4 py-3 text-2xl font-bold text-center outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 ${sign === "neg" ? "text-red-600" : "text-green-600"}`}
                  value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <select className="flex-1 border border-gray-300 rounded-xl px-2 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                value={selYear} onChange={e => setSelYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select className="flex-1 border border-gray-300 rounded-xl px-2 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}>
                {MESI.map((label, i) => <option key={i+1} value={i+1}>{label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Descrizione</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Es. Benzina, Spesa Conad..."
              />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className={`text-xs font-semibold ${lowConfidence && !selectedCatId ? "text-orange-600" : "text-gray-500"}`}>
                  Categoria {lowConfidence && !selectedCatId ? "⬇ Seleziona" : ""}
                </label>
                {!selectedCatId && lowConfidence && (
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold animate-pulse">Richiesta</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {filteredCats.map((cat) => {
                  const meta = getCategoryMeta(cat.name);
                  const isSelected = selectedCatId === cat.id;
                  const isProposed = result.proposed_category === cat.name;
                  return (
                    <button key={cat.id} onClick={() => setSelectedCatId(cat.id)}
                      className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-center transition-all ${
                        isSelected ? "bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-900/30" :
                        isProposed ? "bg-yellow-50 ring-2 ring-yellow-400 dark:bg-yellow-900/20" :
                        "bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
                      }`}>
                      <span className="text-2xl">{meta.icon}</span>
                      <span className="text-[9px] font-semibold text-gray-600 dark:text-gray-300 leading-tight line-clamp-2">{cat.name}</span>
                      {isProposed && !isSelected && (
                        <span className="text-[8px] bg-yellow-400 text-yellow-900 px-1 rounded font-bold">AI</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <button onClick={() => doSave(false)} disabled={saving}
              className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold text-base hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50">
              {saving ? "Salvataggio..." : "✓ Salva Movimento"}
            </button>
          </div>

          <button onClick={() => { setResult(null); setHint(""); }}
            className="w-full text-center text-sm text-blue-600 hover:text-blue-800 py-2">
            📷 Scansiona un altro scontrino
          </button>
        </div>
      )}

      {/* ─── MODAL DUPLICATO (singola) ─────────────────────────────────────── */}
      {dupInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDupInfo(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="text-4xl text-center mb-3">⚠️</div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 text-center mb-2">Possibile duplicato</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-5">{dupInfo.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setDupInfo(null)}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200">
                Annulla
              </button>
              <button onClick={() => { setDupInfo(null); pendingSave?.(); }}
                className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
                Salva comunque
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
