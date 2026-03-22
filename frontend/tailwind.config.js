/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "cw-bg": "#080b14",
        "cw-surface": "#0d1221",
        "cw-border": "#1a2540",
        "cw-muted": "#1e2d4a",
        "cw-accent": "#3d6bff",
        "cw-purple": "#7c3aed",
        "cw-cyan": "#06b6d4",
        "cw-amber": "#f59e0b",
        "cw-green": "#10b981",
        "cw-red": "#ef4444"
      }
    }
  },
  plugins: []
}