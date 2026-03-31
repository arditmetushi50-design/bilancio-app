import { useState, useEffect } from "react";
import { uploadOcr, createMovimento, getCategories, OcrResult, Category, DuplicateError } from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import { useToast } from "../components/Toast";
import { useYears } from "../hooks/useYears";
import axios from "axios";

const MESI = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
const INCOME_TYPES = new Set(["ENTRATA"]);

export default function OcrPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  // Hint PRIMA della foto — aiuta l'AI a classificare meglio
  const [hint, setHint] = useState("");

  // Form conferma dopo OCR
  const [amount, setAmount] = useState("");
  const [sign, setSign] = useState<"neg" | "pos">("neg");
  const [description, setDescription] = useState("");
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1);
  const [showRawText, setShowRawText] = useState(false);

  // Duplicate modal
  const [dupInfo, setDupInfo] = useState<DuplicateError | null>(null);
  const [pendingSave, setPendingSave] = useState<null | (() => void)>(null);

  const years = useYears();

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  const handleFile = async (file: File) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await uploadOcr(file, hint);
      setResult(res);

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
    } catch {
      showToast("Errore nell'elaborazione dell'immagine", "error");
    } finally {
      setLoading(false);
    }
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

  const doSave = async (force = false) => {
    if (!selectedCatId) { showToast("Seleziona una categoria", "error"); return; }
    if (!amount || parseFloat(amount) === 0) { showToast("Inserisci un importo", "error"); return; }
    const desc = description.trim() || hint.trim() || "Scontrino";

    setSaving(true);
    try {
      await createMovimento({
        year: selYear,
        month: selMonth,
        category_id: selectedCatId,
        description: desc,
        amount: sign === "neg" ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount)),
        source: "ocr",
        ocr_raw_text: result?.raw_text,
        ocr_confidence: result?.confidence,
        ocr_proposed_category: result?.proposed_category,
      }, force);
      showToast("Movimento salvato!");
      setResult(null);
      setAmount("");
      setDescription("");
      setSelectedCatId(null);
      setHint("");
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const detail = err.response.data?.detail as DuplicateError;
        setDupInfo(detail);
        setPendingSave(() => () => doSave(true));
      } else {
        showToast("Errore nel salvataggio", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => doSave(false);

  const filteredCats = categories.filter(c =>
    sign === "neg"
      ? c.type === "SPESA_FISSA" || c.type === "SPESA_VARIABILE"
      : c.type === "ENTRATA"
  );

  const confPerc = result ? Math.round(result.confidence) : 0;
  const lowConfidence = confPerc < 60;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Foto Scontrino</h1>
      <p className="text-xs text-gray-500 mb-4">Scatta una foto → l'AI legge importo, data e categoria automaticamente</p>

      {/* ── ZONA UPLOAD ── */}
      {!result && !loading && (
        <div className="space-y-3">
          <div className="card">
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block">
              💡 Descrizione (opzionale ma consigliata)
            </label>
            <input
              type="text"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
              value={hint}
              onChange={e => setHint(e.target.value)}
              placeholder='Es. "benzina", "spesa lidl", "bolletta luce"...'
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Aggiunge contesto → AI classifica meglio la categoria
            </p>
          </div>

          <div
            className="card border-2 border-dashed border-gray-300 dark:border-gray-600 text-center py-8 cursor-pointer hover:border-blue-400 transition-colors"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <div className="text-5xl mb-3">📷</div>
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium mb-1">Scatta o carica lo scontrino</p>
            <p className="text-gray-400 text-xs mb-5">L'AI estrae importo, data e categoria</p>
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

      {/* ── CARICAMENTO ── */}
      {loading && (
        <div className="card text-center py-12">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-gray-700 dark:text-gray-300 font-semibold mb-1">Analisi in corso...</p>
          <p className="text-gray-400 text-sm">Estrazione importo e categoria</p>
        </div>
      )}

      {/* ── RISULTATO + CONFERMA ── */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Badge confidenza + raw text */}
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
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  📌 {hint}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowRawText(!showRawText)}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              {showRawText ? "Nascondi" : "Testo OCR"}
            </button>
          </div>

          {/* Alert bassa confidenza */}
          {lowConfidence && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl px-4 py-3 flex gap-3 items-start">
              <span className="text-xl">🤔</span>
              <div>
                <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                  Non sono sicuro della categoria
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-300 mt-0.5">
                  Controlla e seleziona manualmente la categoria corretta qui sotto.
                </p>
              </div>
            </div>
          )}

          {showRawText && (
            <div className="card bg-gray-50 dark:bg-gray-800">
              <p className="text-xs text-gray-500 mb-1 font-medium">Testo estratto dallo scontrino:</p>
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                {result.raw_text || "(nessun testo rilevato)"}
              </pre>
            </div>
          )}

          {/* Form conferma */}
          <div className="card space-y-4">
            {/* Toggle uscita/entrata */}
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

            {/* Importo */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Importo</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-400">€</span>
                <input
                  type="number"
                  step="0.01"
                  className={`w-full border rounded-xl pl-8 pr-4 py-3 text-2xl font-bold text-center outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 ${sign === "neg" ? "text-red-600" : "text-green-600"}`}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Data */}
            <div className="flex gap-2">
              <select
                className="flex-1 border border-gray-300 rounded-xl px-2 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                value={selYear}
                onChange={e => setSelYear(Number(e.target.value))}
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                className="flex-1 border border-gray-300 rounded-xl px-2 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                value={selMonth}
                onChange={e => setSelMonth(Number(e.target.value))}
              >
                {MESI.map((label, i) => <option key={i+1} value={i+1}>{label}</option>)}
              </select>
            </div>

            {/* Descrizione */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Descrizione</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Es. Benzina, Spesa Conad..."
              />
            </div>

            {/* Categoria — griglia con AI suggerimento */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className={`text-xs font-semibold ${lowConfidence && !selectedCatId ? "text-orange-600" : "text-gray-500"}`}>
                  Categoria {lowConfidence && !selectedCatId ? "⬇ Seleziona" : ""}
                </label>
                {!selectedCatId && lowConfidence && (
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                    Richiesta
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {filteredCats.map((cat) => {
                  const meta = getCategoryMeta(cat.name);
                  const isSelected = selectedCatId === cat.id;
                  const isProposed = result.proposed_category === cat.name;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCatId(cat.id)}
                      className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-center transition-all ${
                        isSelected
                          ? "bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-900/30"
                          : isProposed
                          ? "bg-yellow-50 ring-2 ring-yellow-400 dark:bg-yellow-900/20"
                          : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
                      }`}
                    >
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

            {/* Salva */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold text-base hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? "Salvataggio..." : "✓ Salva Movimento"}
            </button>
          </div>

          {/* Scansiona altro */}
          <button
            onClick={() => { setResult(null); setHint(""); }}
            className="w-full text-center text-sm text-blue-600 hover:text-blue-800 py-2"
          >
            📷 Scansiona un altro scontrino
          </button>
        </div>
      )}

      {/* ─── MODAL DUPLICATO ─── */}
      {dupInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDupInfo(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="text-4xl text-center mb-3">⚠️</div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 text-center mb-2">
              Possibile duplicato
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-5">
              {dupInfo.message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDupInfo(null)}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Annulla
              </button>
              <button
                onClick={() => { setDupInfo(null); pendingSave?.(); }}
                className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold"
              >
                Salva comunque
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
