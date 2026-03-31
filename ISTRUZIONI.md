# Bilancio Personale — Istruzioni Avvio

## Avvio rapido

### 1. Backend (terminale 1)
Doppio click su `start_backend.bat`
oppure:
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Backend disponibile su: http://localhost:8000
Documentazione API interattiva: http://localhost:8000/docs

### 2. Frontend (terminale 2)
Doppio click su `start_frontend.bat`
oppure:
```bash
cd frontend
npm install
npm run dev
```
App disponibile su: http://localhost:5173

---

## Prima volta: importa il tuo Excel storico

1. Avvia backend e frontend
2. Vai su http://localhost:5173
3. Clicca "Importa Excel" nella sidebar
4. Trascina il file `Bilancino_Ricostruito_Stabile_v2_2022-2035.xlsx`
5. Attendi il completamento — vedrai quanti movimenti sono stati importati per anno
6. Torna alla Dashboard per vedere i dati

L'importazione è idempotente: puoi ripeterla senza duplicare i dati.

---

## OCR: carica foto scontrini

Richiede Tesseract OCR installato:
- Windows: https://github.com/UB-Mannheim/tesseract/wiki
- Scarica e installa in `C:\Program Files\Tesseract-OCR\`

Senza Tesseract, la pagina OCR mostrerà un errore descrittivo.
Puoi comunque inserire movimenti manualmente dalla vista Mese.

---

## Struttura file

```
bilancio-app/
├── backend/
│   ├── bilancio.db          ← Database SQLite (creato automaticamente)
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│   ├── routers/             ← API endpoints
│   └── services/            ← Logica OCR, classificatore, Excel import
└── frontend/
    └── src/
        ├── pages/           ← Dashboard, Mese, Anno, OCR, Investimenti
        └── components/      ← Form, Layout
```

---

## Logica contabile rispettata

- Importo positivo = entrata
- Importo negativo = uscita
- Risparmio = totale entrate + totale uscite (le uscite sono già negative)
- Spese fisse: GAS, LUCE, ACQUA, VODAFONE, NETFLIX
- Investimenti: sezione separata, non confluiscono nel risparmio mensile

## Classificazione automatica

Il sistema riconosce automaticamente:
- Coop/Conad/Lidl → SPESE ALIMENTARI
- GPL/benzina/autostrada → AUTOMOBILE
- Stipendio/stipendio ardit met → STIPENDIO
- Felisia/Fefi → CONTRIBUTO MOGLIE
- Netflix → NETFLIX
- Enel/luce → LUCE
- IMU/TARI/F24 → TASSE
- ecc.

Se la confidenza è bassa → movimento inserito in ALTRO.
Ogni correzione manuale viene memorizzata e migliora le future classificazioni.

## Backup

Il database è il file `backend/bilancio.db`.
Fai una copia periodica di questo file per backup completo.
