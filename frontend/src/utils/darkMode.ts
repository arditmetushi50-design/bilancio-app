import { createContext, useContext } from "react";

export const DarkModeContext = createContext({
  dark: false,
  toggle: () => {},
});

export function useDarkMode() {
  return useContext(DarkModeContext);
}
