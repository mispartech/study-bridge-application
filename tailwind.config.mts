import type { Config } from "tailwindcss"

// Loaded from app/globals.css via `@config`. Every colour resolves to a CSS variable in
// styles/tokens.css, so light/dark switching never needs `dark:` colour variants.
const v = (name: string) => `var(--sb-${name})`

const config: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        // Brand tokens
        ink: v("ink"),
        canvas: v("canvas"),
        surface: { DEFAULT: v("surface"), subtle: v("surface-subtle") },
        primary: {
          DEFAULT: v("primary"),
          foreground: v("on-primary"),
          strong: v("primary-strong"),
          tint: v("primary-tint"),
        },
        accent: { DEFAULT: v("accent"), foreground: v("on-accent") },
        success: { DEFAULT: v("success"), strong: v("success-strong"), tint: v("success-tint") },
        warning: { DEFAULT: v("warning"), strong: v("warning-strong"), tint: v("warning-tint") },
        danger: { DEFAULT: v("danger"), strong: v("danger-strong"), tint: v("danger-tint") },
        // shadcn convention: `muted` is a subtle background, `muted-foreground` is the
        // brand muted text colour.
        muted: { DEFAULT: v("surface-subtle"), foreground: v("muted") },
        track: v("track"),
        scrim: v("scrim"),

        // shadcn/ui semantic aliases, so components added with `shadcn add` pick up the theme
        background: v("canvas"),
        foreground: v("ink"),
        card: { DEFAULT: v("surface"), foreground: v("ink") },
        popover: { DEFAULT: v("surface"), foreground: v("ink") },
        secondary: { DEFAULT: v("surface-subtle"), foreground: v("ink") },
        destructive: { DEFAULT: v("danger"), foreground: v("on-primary") },
        border: v("border"),
        input: v("border"),
        ring: v("focus"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-jakarta)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        button: "12px",
      },
    },
  },
}

export default config
