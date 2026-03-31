import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import AnnoPage from "./pages/AnnoPage";
import MesePage from "./pages/MesePage";
import OcrPage from "./pages/OcrPage";
import InvestimentiPage from "./pages/InvestimentiPage";
import ImportPage from "./pages/ImportPage";
import RecurringPage from "./pages/RecurringPage";
import BudgetPage from "./pages/BudgetPage";
import SettingsPage from "./pages/SettingsPage";
import TrendPage from "./pages/TrendPage";
import TabellaAnnualePage from "./pages/TabellaAnnualePage";

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="anno/:year" element={<AnnoPage />} />
            <Route path="anno/:year/mese/:month" element={<MesePage />} />
            <Route path="ocr" element={<OcrPage />} />
            <Route path="investimenti" element={<InvestimentiPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="recurring" element={<RecurringPage />} />
            <Route path="budget" element={<BudgetPage />} />
            <Route path="trend" element={<TrendPage />} />
            <Route path="tabella" element={<TabellaAnnualePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
