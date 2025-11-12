import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        accent: {
          red: "var(--color-accent-red)",
          gold: "var(--color-accent-gold)",
        },
        text: {
          dark: "var(--color-text-dark)",
          muted: "var(--color-text-muted)",
        },
        light: "var(--color-light)",
        soft: "var(--color-soft)",
      },
      borderRadius: {
        xl: "var(--radius-xl)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        "slide-in": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        }
      },
      animation: {
        "fade-up": "fade-up .5s ease-out both",
        "float": "float 3s ease-in-out infinite",
        "slide-in": "slide-in .25s ease-out both"
      }
    }
  },
  plugins: [],
}

export default config
