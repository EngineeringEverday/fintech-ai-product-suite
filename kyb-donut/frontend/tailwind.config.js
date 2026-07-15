/** Fintech-grade palette: cool slate canvas, signal teal accent, semantic
 *  greens/ambers/reds for confidence states. */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#0B1220",
          50: "#F6F8FB",
          100: "#EEF2F7",
          200: "#D9E1EC",
          300: "#B6C2D2",
          400: "#7E8DA3",
          500: "#56657D",
          600: "#3D4A5F",
          700: "#28344A",
          800: "#16223A",
          900: "#0B1220",
        },
        signal: {
          DEFAULT: "#14B8A6",
          50: "#ECFEFB",
          100: "#CFFAF3",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
        },
        conf: {
          high: "#16A34A",
          mid: "#D97706",
          low: "#DC2626",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(20, 32, 56, 0.06), 0 8px 24px -16px rgba(20, 32, 56, 0.12)",
      },
    },
  },
  plugins: [],
};
