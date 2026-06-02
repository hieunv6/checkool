export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#17202A",
        panel: "#FFFFFF",
        line: "#E4E7EC",
        muted: "#667085",
        brand: "#0F766E",
        gold: "#F59E0B",
        loss: "#DC2626",
        gain: "#15803D"
      }
    }
  },
  plugins: []
};
