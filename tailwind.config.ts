import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        ink: "var(--ink)",
        ink2: "var(--ink-2)",
        muted: "var(--ink-muted)",
        accent: "var(--accent)",
        good: "var(--good)",
        hairline: "var(--hairline)",
      },
    },
  },
  plugins: [],
};
export default config;
