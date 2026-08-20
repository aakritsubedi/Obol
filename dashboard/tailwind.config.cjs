/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
      extend: {
        colors: {
          surface: "var(--color-surface)",
          card: "var(--color-card)",
          panel: "var(--color-panel)",
          ink: "var(--color-ink)",
          subtle: "var(--color-subtle)",
          muted: "var(--color-muted)",
          hairline: "var(--color-hairline)",
          wash: "var(--color-wash)",
          track: "var(--color-track)",
          ok: {
            soft: "var(--color-ok-soft)",
            DEFAULT: "var(--color-ok)",
            strong: "var(--color-ok-strong)"
          },
          warn: {
            soft: "var(--color-warn-soft)",
            DEFAULT: "var(--color-warn)",
            strong: "var(--color-warn-strong)"
          },
          over: {
            soft: "var(--color-over-soft)",
            DEFAULT: "var(--color-over)",
            strong: "var(--color-over-strong)"
          }
        },
        fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "Inter", '"Segoe UI"', "sans-serif"]
      }
    }
  },
  plugins: []
};
