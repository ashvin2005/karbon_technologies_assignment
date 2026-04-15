import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["IBM Plex Sans", "sans-serif"]
      },
      colors: {
        ink: "#102A43",
        mint: "#1F9D7A",
        coral: "#D64545",
        sand: "#F6EAD7",
        night: "#0B172A"
      },
      boxShadow: {
        card: "0 16px 40px rgba(16, 42, 67, 0.14)"
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        rise: "rise 400ms ease-out both"
      }
    }
  },
  plugins: []
} satisfies Config;
