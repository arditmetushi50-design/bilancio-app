import { useEffect, useState } from "react";
import { getAnni } from "../api/client";

/**
 * Returns a sorted list of years for dropdowns.
 * Always includes the current year and next year so users can enter future transactions.
 * Merges with actual years from the API (which may include historical data).
 */
export function useYears(): number[] {
  const [years, setYears] = useState<number[]>(() => {
    const cur = new Date().getFullYear();
    return [cur - 1, cur, cur + 1];
  });

  useEffect(() => {
    getAnni()
      .then((apiYears) => {
        const cur = new Date().getFullYear();
        const merged = new Set([...apiYears, cur, cur + 1]);
        setYears(Array.from(merged).sort((a, b) => a - b));
      })
      .catch(() => {}); // keep defaults on error
  }, []);

  return years;
}
