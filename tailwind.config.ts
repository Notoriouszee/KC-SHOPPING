import type { Config } from "tailwindcss";

/**
 * K&C Shopping — black canvas, white type, gold mark.
 *
 * The palette is intentionally monochrome. `ink` runs light-to-dark so existing
 * `text-ink-*` usage stays readable, and `slate` is inverted for the same reason:
 * the app was built light, and every `bg-slate-50` / `border-slate-200` should now
 * read as a dark surface and a hairline.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#080808",
        surface: {
          DEFAULT: "#0b0b0b",
          2: "#121212",
          3: "#1a1a1a",
        },
        line: "#262626",
        brand: {
          50: "#1a1508",
          100: "#2b2310",
          200: "#4a3c18",
          300: "#8a7130",
          400: "#c9a74a",
          500: "#d8b75c",
          600: "#e2c374",
          700: "#efd79a",
          800: "#f6e7bd",
          900: "#fbf3dc",
        },
        ink: {
          300: "#5e5e5e",
          400: "#7d7d7d",
          500: "#9c9c9c",
          600: "#b8b8b8",
          700: "#d4d4d4",
          800: "#e6e6e6",
          900: "#f5f5f5",
        },
        slate: {
          50: "#0b0b0b",
          100: "#121212",
          200: "#242424",
          300: "#333333",
          400: "#5a5a5a",
          500: "#8f8f8f",
          600: "#b3b3b3",
          700: "#d4d4d4",
          800: "#e8e8e8",
          900: "#f7f7f7",
        },
        emerald: {
          50: "#0c1f17",
          100: "#123026",
          200: "#1c4a38",
          300: "#2a6b51",
          400: "#3d8f6d",
          500: "#57b48e",
          600: "#79cba9",
          700: "#a5e0c6",
          800: "#c9efdf",
          900: "#e9fbf4",
        },
        amber: {
          50: "#231a08",
          100: "#33260c",
          200: "#4d3a13",
          300: "#6d521c",
          400: "#977328",
          500: "#c09a3e",
          600: "#d9b862",
          700: "#ecd494",
          800: "#f6e7bd",
          900: "#fdf6e3",
        },
        rose: {
          50: "#240c10",
          100: "#331116",
          200: "#4d1a21",
          300: "#6d252f",
          400: "#96343f",
          500: "#c9505d",
          600: "#e07b86",
          700: "#f0a6ae",
          800: "#f7c9ce",
          900: "#fdeef0",
        },
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', "Helvetica", "Arial", "system-ui", "sans-serif"],
        serif: ['"Didot"', '"Playfair Display"', "Georgia", '"Times New Roman"', "serif"],
      },
      letterSpacing: {
        brand: "0.22em",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset",
      },
    },
  },
  plugins: [],
};

export default config;
