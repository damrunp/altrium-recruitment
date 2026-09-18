/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: "#fbb401",
          50: "#fff8e6",
          100: "#ffedb8",
          200: "#ffe08a",
          300: "#ffd35c",
          400: "#fdc42e",
          500: "#fbb401",
          600: "#d99900",
          700: "#a87600",
          800: "#775400",
          900: "#463100",
        },
        ink: "#0a0a0a",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
      boxShadow: {
        gold: "0 4px 24px -4px rgba(251,180,1,0.35)",
      },
    },
  },
  plugins: [],
};
