import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // ── NJJ brand palette — calibrated to legacy notjustos.netlify.app
        // See ../docs/BRANDING.md for usage rules.
        berry:    "#A62655",   // primary CTA, active nav, headlines accent
        berryLt:  "#D8688E",
        berryBg:  "#F8E4EB",   // active nav background
        coral:    "#E07856",   // pending/warning accents, salmon→coral fade
        salmon:   "#F0AA9A",   // sidebar header band, soft accents
        salmonBg: "#FCE8E0",   // soft fill (e.g. pending row tint)
        peri:     "#7B5BA8",   // periwinkle — info / counts
        periBg:   "#E8DEF0",
        cream:    "#FBF6EE",   // page background
        creamDk:  "#F4ECDF",   // section / subtle stripes
        ink:      "#1A1A2E",   // primary text
        inkSoft:  "#5C5C6E",   // secondary text
        border:   "#E8E0D6",   // hairline borders + dividers
        yellow:   "#E8B547",   // golden — pending / warning highlights
        yellowBg: "#FBEFC7",
        green:    "#2E7D32",   // success — paid, delivered, checked-in
        greenBg:  "#E8F5E9",
      },
      borderRadius: {
        sm:      "6px",
        DEFAULT: "10px",
        lg:      "14px",
        xl:      "20px",
      },
      fontFamily: {
        // Body / UI text — clean sans
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        // Page titles + KPI numbers — warm serif
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
      letterSpacing: {
        // Small-caps section labels
        smallcaps: "0.08em",
      },
      boxShadow: {
        card: "0 1px 2px rgba(26, 26, 46, 0.04), 0 1px 1px rgba(26, 26, 46, 0.03)",
      },
    },
  },
  plugins: [],
};

export default config;
