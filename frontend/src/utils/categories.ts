export interface CategoryMeta {
  icon: string;
  color: string;        // Tailwind class like "bg-orange-500"
  hex: string;          // Hex color for charts
  textColor: string;    // Tailwind text class
}

export const CATEGORY_MAP: Record<string, CategoryMeta> = {
  "GAS":                { icon: "🔥", color: "bg-orange-500",  hex: "#f97316", textColor: "text-orange-500" },
  "LUCE":               { icon: "💡", color: "bg-yellow-500",  hex: "#eab308", textColor: "text-yellow-500" },
  "ACQUA":              { icon: "💧", color: "bg-cyan-500",    hex: "#06b6d4", textColor: "text-cyan-500" },
  "VODAFONE":           { icon: "📱", color: "bg-red-500",     hex: "#ef4444", textColor: "text-red-500" },
  "NETFLIX":            { icon: "🎬", color: "bg-red-600",     hex: "#dc2626", textColor: "text-red-600" },
  "SPESE ALIMENTARI":   { icon: "🛒", color: "bg-green-500",   hex: "#22c55e", textColor: "text-green-500" },
  "AUTOMOBILE":         { icon: "🚗", color: "bg-blue-500",    hex: "#3b82f6", textColor: "text-blue-500" },
  "SPESA SPORT":        { icon: "⚽", color: "bg-emerald-500", hex: "#10b981", textColor: "text-emerald-500" },
  "USCITE E VACANZE":   { icon: "✈️", color: "bg-purple-500",  hex: "#a855f7", textColor: "text-purple-500" },
  "TASSE":              { icon: "📋", color: "bg-gray-600",    hex: "#4b5563", textColor: "text-gray-600" },
  "ALTRO":              { icon: "📦", color: "bg-gray-400",    hex: "#9ca3af", textColor: "text-gray-400" },
  "STIPENDIO":          { icon: "💰", color: "bg-green-600",   hex: "#16a34a", textColor: "text-green-600" },
  "CONTRIBUTO MOGLIE":  { icon: "❤️", color: "bg-pink-500",    hex: "#ec4899", textColor: "text-pink-500" },
  "ALTRE ENTRATE":      { icon: "💵", color: "bg-green-400",   hex: "#4ade80", textColor: "text-green-400" },
  "AFFITTO":            { icon: "🏠", color: "bg-amber-600",   hex: "#d97706", textColor: "text-amber-600" },
};

const DEFAULT_META: CategoryMeta = {
  icon: "📌",
  color: "bg-gray-400",
  hex: "#9ca3af",
  textColor: "text-gray-400",
};

export function getCategoryMeta(name: string): CategoryMeta {
  return CATEGORY_MAP[name.toUpperCase()] ?? CATEGORY_MAP[name] ?? DEFAULT_META;
}

// All category colors as an array for chart usage
export const CHART_COLORS = Object.values(CATEGORY_MAP).map((m) => m.hex);
