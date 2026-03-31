import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { importExcel } from "../api/client";

export default function ImportPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await importExcel(files[0]);
      setResult(res);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Errore importazione");
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: false,
  });

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Importa Excel storico</h1>
      <p className="text-sm text-gray-500 mb-6">
        Carica il tuo file <code className="bg-gray-100 px-1 rounded text-xs">Bilancino_Ricostruito_Stabile_v2_2022-2035.xlsx</code> per importare tutti i dati storici nel database.
      </p>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors mb-6 ${
          isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-300 bg-white"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-4xl mb-3">📂</p>
        <p className="font-medium text-gray-700">
          {isDragActive ? "Rilascia il file qui..." : "Trascina il file Excel o clicca per selezionare"}
        </p>
        <p className="text-xs text-gray-400 mt-1">Solo file .xlsx</p>
      </div>

      {loading && (
        <div className="card text-center py-8 text-gray-500">
          <div className="animate-spin text-3xl mb-2">⚙️</div>
          Importazione in corso... (può richiedere qualche secondo)
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="card border border-green-200 bg-green-50/30">
          <p className="font-semibold text-green-700 mb-4">✅ Importazione completata!</p>
          <div className="space-y-2">
            {result.result?.years?.map((y: any) => (
              <div key={y.year} className="flex items-center justify-between text-sm border-b border-green-100 pb-2">
                <span className="font-medium text-gray-700">Anno {y.year}</span>
                <div className="flex gap-4 text-gray-600">
                  <span className="text-green-600">✓ {y.imported} importati</span>
                  {y.skipped > 0 && <span className="text-gray-400">~ {y.skipped} saltati (duplicati)</span>}
                </div>
              </div>
            ))}
            {result.result?.investments && (
              <div className="flex items-center justify-between text-sm pt-1">
                <span className="font-medium text-gray-700">Investimenti</span>
                <span className="text-green-600">✓ {result.result.investments.imported} importati</span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Ora puoi navigare nella Dashboard per vedere i dati importati.
          </p>
        </div>
      )}

      <div className="card mt-6 bg-amber-50/40 border border-amber-200">
        <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Informazioni importanti</p>
        <ul className="text-xs text-amber-700 space-y-1 list-disc pl-4">
          <li>L'importazione è sicura: i duplicati vengono saltati automaticamente</li>
          <li>Puoi importare più volte senza perdere dati già esistenti</li>
          <li>Dopo l'importazione, correggi eventuali categorie errate dalla vista Mese</li>
          <li>Ogni correzione viene memorizzata per migliorare le classificazioni future</li>
        </ul>
      </div>
    </div>
  );
}
