export const THEME_STORAGE_KEY = "sb-theme"

export type Theme = "light" | "dark"

// Runs inline in <head> before first paint so the page never flashes the wrong theme.
// Kept as a string because it must execute before React hydrates.
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`
