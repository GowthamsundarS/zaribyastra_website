export default {content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        maroon: {
          DEFAULT: "#6B0F1A",
          deep: "#4A0A13",
          ink: "#1F0509",
        },
        ivory: "#F7F2EA",
        sand: "#EDE4D8",
        gold: "#C9A45C",
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "Times", "serif"],
        // Montserrat stands in for Mograph; swap this stack when the real files land
        sans: ["Montserrat", "system-ui", "sans-serif"],
        arabic: ["Amiri", "serif"],
        condensed: ["Impact", "sans-serif"],
      },
      transitionTimingFunction: {
        roman: "cubic-bezier(0.14, 1, 0.34, 1)",
      },
    },
  },
};
