import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getAnni, getCategories, createCategory, updateCategory, deleteCategory, createBackup, listBackups, resetAllData, Category } from "../api/client";
import { getCategoryMeta } from "../utils/categories";
import { useDarkMode } from "../utils/darkMode";
import { useToast } from "../components/Toast";


export default function SettingsPage() {
  const { dark, toggle } = useDarkMode();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [anni, setAnni] = useState<number[]>([]);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [backups, setBackups] = useState<string[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);

  // Category management state
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState("SPESA_VARIABILE");
  const [addingCat, setAddingCat] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Rename state
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Reset state
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    getAnni().then(setAnni).catch(() => {});
    getCategories().then(setCategories).catch(() => {});
    listBackups().then((list) => setBackups(list.backups || [])).catch(() => {});
  }, []);

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await createBackup();
      showToast(`Backup creato: ${res.filename}`);
      const list = await listBackups();
      setBackups(list.backups || []);
    } catch {
      showToast("Errore nel backup", "error");
    } finally {
      setBackupLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) { showToast("Inserisci un nome", "error"); return; }
    setAddingCat(true);
    try {
      await createCategory({ name: newCatName.trim(), type: newCatType });
      showToast("Categoria aggiunta!");
      setNewCatName("");
      setShowAddForm(false);
      const cats = await getCategories();
      setCategories(cats);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Errore", "error");
    } finally {
      setAddingCat(false);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    const txMsg = `Eliminare la categoria "${cat.name}"? Le transazioni esistenti verranno spostate in ALTRO.`;
    if (!confirm(txMsg)) return;
    try {
      await deleteCategory(cat.id);
      showToast("Categoria eliminata");
      const cats = await getCategories();
      setCategories(cats);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Errore nell'eliminazione", "error");
    }
  };

  const startEdit = (cat: Category) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
    setTimeout(() => editInputRef.current?.select(), 50);
  };

  const handleRenameCategory = async (cat: Category) => {
    const newName = editingCatName.trim().toUpperCase();
    if (!newName || newName === cat.name) { setEditingCatId(null); return; }
    try {
      await updateCategory(cat.id, { name: newName });
      showToast("Categoria rinominata!");
      setEditingCatId(null);
      const cats = await getCategories();
      setCategories(cats);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Errore nella rinomina", "error");
    }
  };

  const handleReset = async () => {
    if (resetConfirm !== "RESET") {
      showToast('Scrivi "RESET" per confermare', "error");
      return;
    }
    setResetting(true);
    try {
      await resetAllData();
      showToast("Dati cancellati. Backup salvato automaticamente.");
      setResetConfirm("");
      navigate("/");
    } catch {
      showToast("Errore nella cancellazione", "error");
    } finally {
      setResetting(false);
    }
  };

  // Group categories by type
  const grouped = {
    SPESA_FISSA: categories.filter(c => c.type === "SPESA_FISSA"),
    SPESA_VARIABILE: categories.filter(c => c.type === "SPESA_VARIABILE"),
    ENTRATA: categories.filter(c => c.type === "ENTRATA"),
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Impostazioni</h1>

      {/* Tema */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Aspetto</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Tema Scuro</p>
            <p className="text-xs text-gray-500">Cambia l'aspetto dell'app</p>
          </div>
          <button
            onClick={toggle}
            className={`relative w-12 h-6 rounded-full transition-colors ${dark ? "bg-blue-600" : "bg-gray-300"}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${dark ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>

      {/* Gestione Categorie */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Gestione Categorie</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium"
          >
            + Aggiungi
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 mb-4 space-y-2">
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              placeholder="Nome categoria (es. PALESTRA)"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value.toUpperCase())}
              maxLength={40}
            />
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              value={newCatType}
              onChange={e => setNewCatType(e.target.value)}
            >
              <option value="SPESA_FISSA">Spesa Fissa (es. abbonamenti)</option>
              <option value="SPESA_VARIABILE">Spesa Variabile (es. spesa, carburante)</option>
              <option value="ENTRATA">Entrata (es. stipendio, bonus)</option>
            </select>
            <div className="flex gap-2">
              <button onClick={handleAddCategory} disabled={addingCat} className="btn-primary text-sm py-2 flex-1">
                {addingCat ? "Salvataggio..." : "Salva"}
              </button>
              <button onClick={() => setShowAddForm(false)} className="btn-ghost text-sm py-2 flex-1">
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Category list grouped by type */}
        {[
          { key: "SPESA_FISSA", label: "Spese Fisse", color: "bg-purple-100 text-purple-700" },
          { key: "SPESA_VARIABILE", label: "Spese Variabili", color: "bg-orange-100 text-orange-700" },
          { key: "ENTRATA", label: "Entrate", color: "bg-green-100 text-green-700" },
        ].map(({ key, label, color }) => (
          <div key={key} className="mb-4">
            <p className={`text-xs font-semibold px-2 py-1 rounded-md mb-2 inline-block ${color}`}>{label}</p>
            <div className="space-y-1">
              {grouped[key as keyof typeof grouped].map((cat) => {
                const meta = getCategoryMeta(cat.name);
                const isEditing = editingCatId === cat.id;
                return (
                  <div key={cat.id} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    <span className="text-lg">{meta.icon}</span>
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        className="flex-1 text-sm font-medium border border-blue-400 rounded px-2 py-0.5 outline-none dark:bg-gray-800 dark:text-gray-100 uppercase"
                        value={editingCatName}
                        onChange={e => setEditingCatName(e.target.value.toUpperCase())}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleRenameCategory(cat);
                          if (e.key === "Escape") setEditingCatId(null);
                        }}
                        onBlur={() => handleRenameCategory(cat)}
                        maxLength={40}
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100 flex-1">{cat.name}</span>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(cat)}
                        className="text-xs text-gray-400 hover:text-blue-600 px-1.5 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        title="Rinomina categoria"
                      >✏️</button>
                    )}
                    {isEditing && (
                      <button
                        onClick={() => setEditingCatId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1"
                        title="Annulla"
                      >✕</button>
                    )}
                    <button
                      onClick={() => handleDeleteCategory(cat)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                      title="Elimina categoria"
                    >🗑</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Esporta Dati */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Esporta Dati</h2>
        <div className="flex gap-2">
          <select
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            value={exportYear}
            onChange={(e) => setExportYear(Number(e.target.value))}
          >
            {anni.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <a
            href={`/api/export/excel/${exportYear}`}
            download
            className="btn-primary text-sm py-2 px-4 no-underline"
          >
            Scarica Excel
          </a>
        </div>
      </div>

      {/* Backup */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Backup</h2>
        <button
          onClick={handleCreateBackup}
          disabled={backupLoading}
          className="btn-primary text-sm py-2 w-full mb-3"
        >
          {backupLoading ? "Creazione..." : "Crea Backup Ora"}
        </button>
        {backups.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Backup disponibili:</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {backups.map((b) => (
                <div key={b} className="text-xs text-gray-600 dark:text-gray-400 py-1 px-2 bg-gray-50 dark:bg-gray-700 rounded">
                  {b}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Links rapidi */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Strumenti</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { to: "/budget", label: "Budget", icon: "💰", desc: "Limiti mensili" },
            { to: "/recurring", label: "Ricorrenti", icon: "🔁", desc: "Movimenti mensili fissi" },
            { to: "/trend", label: "Trend", icon: "📉", desc: "Andamento spese" },
            { to: "/tabella", label: "Tabella", icon: "📊", desc: "Vista annuale" },
            { to: "/import", label: "Importa", icon: "📂", desc: "Da Excel" },
          ].map((item) => (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className="card p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
            >
              <span className="text-2xl">{item.icon}</span>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-1">{item.label}</p>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Zona Pericolosa */}
      <div className="card border-red-200 dark:border-red-800">
        <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">Zona Pericolosa</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Cancella tutti i movimenti, investimenti e impostazioni. Un backup viene creato automaticamente prima dell'operazione.
        </p>
        <input
          type="text"
          className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm mb-2 dark:bg-gray-800 dark:border-red-800 dark:text-gray-100"
          placeholder='Scrivi "RESET" per confermare'
          value={resetConfirm}
          onChange={(e) => setResetConfirm(e.target.value)}
        />
        <button
          onClick={handleReset}
          disabled={resetting || resetConfirm !== "RESET"}
          className="w-full py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors"
        >
          {resetting ? "Cancellazione in corso..." : "Cancella Tutti i Dati"}
        </button>
      </div>

      {/* Info */}
      <div className="card text-center py-4">
        <p className="text-gray-400 text-xs">Bilancio v1.1.0 · Gestione Personale</p>
      </div>
    </div>
  );
}
