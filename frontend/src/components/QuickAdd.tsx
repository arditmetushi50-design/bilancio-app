import { useState, useEffect } from "react";
import { createMovimento, getCategories, Category, DuplicateError } from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import { useToast } from "./Toast";
import { useYears } from "../hooks/useYears";
import axios from "axios";

// Step 1 = scegli categoria, Step 2 = inserisci importo
type Step = "category" | "amount";

export default function QuickAdd() {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("category");
  const [categories, setCategories] = useState<Category[]>([]);
  const [catError, setCatError] = useState(false);
  const [amount, setAmount] = useState("0");
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [sign, setSign] = useState<"neg" | "pos">("neg");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { showToast } = useToast();

  // Duplicate modal
  const [dupInfo, setDupInfo] = useState<DuplicateError | null>(null);
  const [pendingSave, setPendingSave] = useState<null | (() => void)>(null);

  const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  const years = useYears();

  const filteredCategories = categories.filter((cat) =>
    sign === "neg"
      ? cat.type === "SPESA_FISSA" || cat.type === "SPESA_VARIABILE"
      : cat.type === "ENTRATA"
  );

  const fixedCats = filteredCategories.filter(c => c.type === "SPESA_FISSA");
  const varCats = filteredCategories.filter(c => c.type === "SPESA_VARIABILE");
  const entryCats = filteredCategories.filter(c => c.type === "ENTRATA");

  useEffect(() => {
    if (open && categories.length === 0) {
      getCategories()
        .then(setCategories)
        .catch(() => setCatError(true));
    }
  }, [open]);

  // Reset categoria selezionata quando cambia sign
  useEffect(() => {
    setSelectedCat(null);
  }, [sign]);

  const reset = () => {
    setAmount("0");
    setSign("neg");
    setDescription("");
    setSelectedCat(null);
    setStep("category");
    setShowDatePicker(false);
    setDupInfo(null);
    setPendingSave(null);
    const n = new Date();
    setSelectedYear(n.getFullYear());
    setSelectedMonth(n.getMonth() + 1);
  };

  const handleClose = () => { setOpen(false); reset(); };

  const handleSelectCategory = (cat: Category) => {
    setSelectedCat(cat);
    setDescription("");
    setStep("amount");
  };

  const handleNumPad = (val: string) => {
    if (val === "C") { setAmount("0"); return; }
    if (val === "DEL") {
      setAmount(prev => prev.length <= 1 ? "0" : prev.slice(0, -1));
      return;
    }
    if (val === "." && amount.includes(".")) return;
    const dotIdx = amount.indexOf(".");
    if (dotIdx !== -1 && amount.length - dotIdx > 2 && val !== ".") return;
    setAmount(prev => prev === "0" && val !== "." ? val : prev + val);
  };

  const doSave = async (force = false) => {
    const amtVal = parseFloat(amount);
    if (!amtVal || !selectedCat) { showToast("Inserisci un importo", "error"); return; }
    const desc = description.trim() || selectedCat.name;
    setSaving(true);
    try {
      await createMovimento({
        year: selectedYear,
        month: selectedMonth,
        category_id: selectedCat.id,
        description: desc,
        amount: sign === "neg" ? -Math.abs(amtVal) : Math.abs(amtVal),
        source: "quick_add",
      }, force);
      showToast(`${selectedCat.name} salvato!`);
      handleClose();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const detail = err.response.data?.detail as DuplicateError;
        setDupInfo(detail);
        // Store a closure that will force-save when confirmed
        setPendingSave(() => () => doSave(true));
      } else {
        showToast("Errore nel salvataggio", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => doSave(false);

  const numPadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "DEL"];
  const meta = selectedCat ? getCategoryMeta(selectedCat.name) : null;

  const CatButton = ({ cat }: { cat: Category }) => {
    const m = getCategoryMeta(cat.name);
    return (
      <button
        onClick={() => handleSelectCategory(cat)}
        className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95 transition-all"
      >
        <span className="text-3xl">{m.icon}</span>
        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 leading-tight text-center line-clamp-2 w-full px-1">
          {cat.name}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-30 w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center text-3xl font-light"
        aria-label="Aggiungi movimento"
      >
        +
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={handleClose} />

          <div className="relative bg-white dark:bg-gray-900 w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col animate-slide-up">

            {/* ─── STEP 1: scegli categoria ─── */}
            {step === "category" && (
              <>
                {/* Header con toggle */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                  <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 flex-1 mr-3">
                    <button
                      className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-colors ${sign === "neg" ? "bg-red-500 text-white shadow" : "text-gray-500"}`}
                      onClick={() => setSign("neg")}
                    >− Uscita</button>
                    <button
                      className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-colors ${sign === "pos" ? "bg-green-500 text-white shadow" : "text-gray-500"}`}
                      onClick={() => setSign("pos")}
                    >+ Entrata</button>
                  </div>
                  <button onClick={handleClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-200 shrink-0">×</button>
                </div>

                <p className="text-xs text-gray-400 px-4 mb-2 shrink-0">Seleziona categoria</p>

                {/* Griglia categorie scrollabile */}
                <div className="overflow-y-auto px-4 pb-6">
                  {catError ? (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-3xl mb-2">⚠️</p>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Impossibile caricare le categorie</p>
                      <p className="text-xs mt-1">Controlla che il server sia avviato</p>
                      <button
                        onClick={() => { setCatError(false); getCategories().then(setCategories).catch(() => setCatError(true)); }}
                        className="mt-3 text-xs text-blue-600 underline"
                      >Riprova</button>
                    </div>
                  ) : categories.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <div className="animate-spin text-2xl mb-2">⏳</div>
                      <p className="text-sm">Caricamento categorie...</p>
                    </div>
                  ) : (
                    <>
                      {sign === "neg" && fixedCats.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[11px] font-bold text-purple-600 uppercase tracking-wider mb-2">Spese Fisse</p>
                          <div className="grid grid-cols-4 gap-2">
                            {fixedCats.map(cat => <CatButton key={cat.id} cat={cat} />)}
                          </div>
                        </div>
                      )}
                      {sign === "neg" && varCats.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[11px] font-bold text-orange-600 uppercase tracking-wider mb-2">Spese Variabili</p>
                          <div className="grid grid-cols-4 gap-2">
                            {varCats.map(cat => <CatButton key={cat.id} cat={cat} />)}
                          </div>
                        </div>
                      )}
                      {sign === "pos" && entryCats.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[11px] font-bold text-green-600 uppercase tracking-wider mb-2">Entrate</p>
                          <div className="grid grid-cols-4 gap-2">
                            {entryCats.map(cat => <CatButton key={cat.id} cat={cat} />)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {/* ─── STEP 2: inserisci importo ─── */}
            {step === "amount" && selectedCat && meta && (
              <>
                {/* Header categoria selezionata */}
                <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
                  <button
                    onClick={() => setStep("category")}
                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 text-lg"
                  >‹</button>
                  <span className="text-2xl">{meta.icon}</span>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{selectedCat.name}</p>
                    <p className="text-xs text-gray-400">{sign === "neg" ? "Uscita" : "Entrata"}</p>
                  </div>
                  {/* Data compatta */}
                  <button
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2.5 py-1.5 rounded-lg font-medium"
                  >
                    {MONTHS[selectedMonth - 1]} {selectedYear}
                  </button>
                  <button onClick={handleClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500">×</button>
                </div>

                {/* Date picker espandibile */}
                {showDatePicker && (
                  <div className="flex gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shrink-0">
                    <select
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      value={selectedYear}
                      onChange={e => setSelectedYear(Number(e.target.value))}
                    >
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      value={selectedMonth}
                      onChange={e => setSelectedMonth(Number(e.target.value))}
                    >
                      {MONTHS.map((label, i) => <option key={i + 1} value={i + 1}>{label}</option>)}
                    </select>
                  </div>
                )}

                <div className="overflow-y-auto flex flex-col">
                  {/* Importo display */}
                  <div className="text-center px-4 py-4 shrink-0">
                    <p className={`text-5xl font-bold tracking-tight ${sign === "neg" ? "text-red-500" : "text-green-500"}`}>
                      {sign === "neg" ? "−" : "+"}€{amount}
                    </p>
                  </div>

                  {/* Descrizione opzionale */}
                  <div className="px-4 mb-3 shrink-0">
                    <input
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder={`Descrizione (opzionale — default: ${selectedCat.name})`}
                    />
                  </div>

                  {/* Numpad */}
                  <div className="px-4 mb-3 shrink-0">
                    <div className="grid grid-cols-3 gap-2">
                      {numPadKeys.map(key => (
                        <button
                          key={key}
                          onClick={() => handleNumPad(key)}
                          className={`py-4 rounded-xl text-xl font-semibold transition-colors active:scale-95 ${
                            key === "DEL"
                              ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
                          }`}
                        >
                          {key === "DEL" ? "⌫" : key}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Salva */}
                  <div className="px-4 pb-6 shrink-0">
                    <button
                      onClick={handleSave}
                      disabled={saving || amount === "0"}
                      className={`w-full py-4 rounded-xl text-white font-bold text-lg active:scale-[0.98] transition-all disabled:opacity-40 ${
                        sign === "neg" ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                      }`}
                    >
                      {saving ? "Salvataggio..." : `Salva ${sign === "neg" ? "uscita" : "entrata"}`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL DUPLICATO ─── */}
      {dupInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDupInfo(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
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
    </>
  );
}
