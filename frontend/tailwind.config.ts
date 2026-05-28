import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          50: "#F4F5F7",
          100: "#E5E7EB",
          200: "#CBD0D8",
          300: "#9AA1AE",
          400: "#6B7180",
          500: "#4A5060",
          600: "#363B49",
          700: "#272B36",
          800: "#1A1D26",
          900: "#0F1118",
          950: "#0A0C12",
        },
        accent: {
          DEFAULT: "#2E7FF1", // financial blue
          hover: "#1E63C7",
          soft: "#1A3A66",
        },
        risk: {
          low: "#22B07B",
          medium: "#EAB308",
          high: "#F97316",
          critical: "#EF4444",
        },
      },
    },
  },
} satisfies Config;
