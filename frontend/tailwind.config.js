/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        entrata: "#16a34a",
        uscita: "#dc2626",
        fissa: "#7c3aed",
        variabile: "#ea580c",
        risparmio: "#0284c7",
      },
    },
  },
  plugins: [],
};

