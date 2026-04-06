import axios from "axios";

// In dev: proxy Vite → localhost:8000
// In production: backend serves both API and frontend on the same origin
const API_BASE = "/api";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Types
export interface Category {
  id: number;
  name: string;
  type: "SPESA_FISSA" | "SPESA_VARIABILE" | "ENTRATA" | "INVESTIMENTO";
  display_order: number;
}

export interface Transaction {
  id: number;
  year: number;
  month: number;
  category_id: number;
  category: Category;
  description: string;
  amount: number;
  source: string;
  ocr_raw_text?: string;
  ocr_confidence?: number;
  ocr_proposed_category?: string;
}

export interface MonthSummary {
  year: number;
  month: number;
  total_entrate: number;
  total_uscite: number;
  risparmio: number;
  spese_fisse: number;
  by_category: Record<string, number>;
}

export interface YearSummary {
  year: number;
  months: MonthSummary[];
  total_entrate: number;
  total_uscite: number;
  risparmio: number;
}

export interface OcrTransactionItem {
  description: string;
  amount: number;
  year: number;
  month: number;
  proposed_category: string;
  confidence: number;
}

export interface OcrResult {
  raw_text: string;
  amount?: number;
  description?: string;
  date_hint?: string;
  proposed_category?: string;
  confidence: number;
  year_hint?: number;
  month_hint?: number;
  mode: "single" | "multi";
  transactions?: OcrTransactionItem[];
}

export interface Investment {
  id: number;
  date: string;
  asset: string;
  asset_type: string;
  amount_invested: number;
  current_value?: number;
  notes?: string;
}

// API calls
export const getCategories = () => api.get<Category[]>("/categories/").then(r => r.data);

export const getMovimenti = (year?: number, month?: number, category_id?: number) =>
  api.get<Transaction[]>("/movimenti/", { params: { year, month, category_id } }).then(r => r.data);

export interface DuplicateError {
  code: "DUPLICATE";
  message: string;
  existing_id: number;
  existing_description: string;
  existing_amount: number;
}

export const createMovimento = (
  data: Omit<Transaction, "id" | "category">,
  force = false
) => api.post<Transaction>("/movimenti/", { ...data, force }).then(r => r.data);

export const updateMovimento = (id: number, data: Partial<Transaction>) =>
  api.put<Transaction>(`/movimenti/${id}`, data).then(r => r.data);

export const deleteMovimento = (id: number) =>
  api.delete(`/movimenti/${id}`);

export const getAnni = () => api.get<number[]>("/riepilogo/anni").then(r => r.data);

export const getYearSummary = (year: number) =>
  api.get<YearSummary>(`/riepilogo/${year}`).then(r => r.data);

export const getMonthSummary = (year: number, month: number) =>
  api.get<MonthSummary>(`/riepilogo/${year}/${month}`).then(r => r.data);

export const checkOcrDuplicates = (
  items: { description: string; amount: number; year: number; month: number }[]
) =>
  api.post<{ index: number; is_duplicate: boolean; existing_id?: number; existing_description?: string }[]>(
    "/ocr/check-duplicates", items
  ).then(r => r.data);

export const uploadOcr = (file: File, hint?: string) => {
  const form = new FormData();
  form.append("file", file);
  if (hint && hint.trim()) form.append("hint", hint.trim());
  return api.post<OcrResult>("/ocr/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};

export const importExcel = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/import/excel", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  }).then(r => r.data);
};

export const getInvestimenti = () => api.get<Investment[]>("/investimenti/").then(r => r.data);
export const createInvestimento = (data: Omit<Investment, "id">) =>
  api.post<Investment>("/investimenti/", data).then(r => r.data);
export const updateInvestimento = (id: number, data: Partial<Investment>) =>
  api.put<Investment>(`/investimenti/${id}`, data).then(r => r.data);
export const deleteInvestimento = (id: number) => api.delete(`/investimenti/${id}`);
export const getRiepilogoInvestimenti = () => api.get("/investimenti/riepilogo").then(r => r.data);

// Search
export const searchMovimenti = (q: string) =>
  api.get<{year: number, transactions: Transaction[]}[]>("/movimenti/search", { params: { q } }).then(r => r.data);

// Recurring
export const getRecurring = () => api.get("/recurring/").then(r => r.data);
export const createRecurring = (data: any) => api.post("/recurring/", data).then(r => r.data);
export const updateRecurring = (id: number, data: any) => api.put(`/recurring/${id}`, data).then(r => r.data);
export const deleteRecurring = (id: number) => api.delete(`/recurring/${id}`);
export const applyRecurring = (year: number, month: number) => api.post(`/recurring/apply/${year}/${month}`).then(r => r.data);
export const getRecurringSuggestions = () => api.get("/recurring/suggestions").then(r => r.data);
export const getRecurringHistory = () => api.get("/recurring/history").then(r => r.data);
export const getRecurringForecast = (year: number, month: number, monthsAhead?: number) =>
  api.get(`/recurring/forecast/${year}/${month}`, { params: monthsAhead ? { months_ahead: monthsAhead } : {} }).then(r => r.data);
export const getRecurringInsights = (year: number, month: number) => api.get(`/recurring/insights/${year}/${month}`).then(r => r.data);
export const getRecurringAnomalies = (year: number, month: number) => api.get(`/recurring/anomalies/${year}/${month}`).then(r => r.data);
export const dismissSuggestion = (normalized_description: string, category_id: number) =>
  api.post("/recurring/dismiss", { normalized_description, category_id }).then(r => r.data);

// Budget
export const getBudgetLimits = () => api.get("/budget/").then(r => r.data);
export const setBudgetLimit = (data: {category_id: number, monthly_limit: number}) => api.post("/budget/", data).then(r => r.data);
export const deleteBudgetLimit = (categoryId: number) => api.delete(`/budget/${categoryId}`);
export const getBudgetStatus = (year: number, month: number) => api.get(`/budget/status/${year}/${month}`).then(r => r.data);

// Backup
export const createBackup = () => api.post("/backup/create").then(r => r.data);
export const listBackups = () => api.get("/backup/list").then(r => r.data);

// Export
export const exportExcelUrl = (year: number) => `${API_BASE}/export/excel/${year}`;

// Categories CRUD
export const createCategory = (data: {name: string, type: string}) => api.post<Category>("/categories/", data).then(r => r.data);
export const updateCategory = (id: number, data: {name?: string, type?: string}) => api.put<Category>(`/categories/${id}`, data).then(r => r.data);
export const deleteCategory = (id: number) => api.delete(`/categories/${id}`);

// Admin
export const resetAllData = () => api.post("/admin/reset").then(r => r.data);
