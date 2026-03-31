import { NavLink, Outlet } from "react-router-dom";
import QuickAdd from "./QuickAdd";
import SearchBar from "./SearchBar";

const navItems = [
  { to: "/", label: "Home", icon: "🏠" },
  { to: "/ocr", label: "Foto", icon: "📷" },
  { to: "/budget", label: "Budget", icon: "💰" },
  { to: "/investimenti", label: "Invest.", icon: "📈" },
  { to: "/settings", label: "Altro", icon: "⚙️" },
];

const desktopExtraItems = [
  { to: "/tabella", label: "Tabella Annuale", icon: "📊" },
  { to: "/trend", label: "Trend Spese", icon: "📉" },
  { to: "/import", label: "Importa Excel", icon: "📂" },
  { to: "/budget", label: "Budget", icon: "💰" },
  { to: "/settings", label: "Impostazioni", icon: "⚙️" },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Top header - visibile su mobile */}
      <header className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-2 sticky top-0 z-20">
        <span className="text-xl">💰</span>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">Bilancio</h1>
          <p className="text-xs text-gray-400">Gestione Personale</p>
        </div>
        <SearchBar variant="mobile" />
      </header>

      <div className="flex flex-1">
        {/* Sidebar - solo desktop */}
        <nav className="hidden md:flex w-56 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col py-6 px-3 gap-1 fixed h-full z-10">
          <div className="px-3 mb-4">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">💰 Bilancio</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Gestione Personale</p>
          </div>

          <div className="px-1 mb-4">
            <SearchBar variant="desktop" />
          </div>

          {navItems.filter(i => i.to !== "/settings").map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label === "Invest." ? "Investimenti" : item.label === "Ricorr." ? "Ricorrenti" : item.label}
            </NavLink>
          ))}
          {desktopExtraItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 md:ml-56 p-4 md:p-6 pb-24 md:pb-6 min-h-screen">
          <Outlet />
        </main>
      </div>

      {/* Bottom navigation - solo mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-20 safe-area-inset-bottom">
        <div className="flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                  isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"
                }`
              }
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* QuickAdd FAB - appears on all pages */}
      <QuickAdd />
    </div>
  );
}
