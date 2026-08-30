/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--color-surface)",
        card: "var(--color-card)",
        panel: "var(--color-panel)",
        raised: "var(--color-raised)",
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
        },
        note: {
          paper: "var(--note-paper)",
          edge: "var(--note-edge)",
          rule: "var(--note-rule)",
          ink: "var(--note-ink)",
          subtle: "var(--note-subtle)",
          muted: "var(--note-muted)",
          accent: "var(--note-accent)",
          "accent-soft": "var(--note-accent-soft)"
        }
      },
      // Elevation is a token, not a per-component literal, so light and dark
      // can disagree about how much shadow a surface needs.
      boxShadow: {
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
        pop: "var(--shadow-pop)",
        dialog: "var(--shadow-dialog)"
      },
      borderRadius: {
        card: "16px",
        control: "10px"
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "Inter", '"Segoe UI"', "sans-serif"]
      }
    }
  },
  plugins: []
};
