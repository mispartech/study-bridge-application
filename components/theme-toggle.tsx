"use client"

import { useEffect, useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme"

// The `dark` class on <html> is the source of truth (set before paint by themeInitScript),
// so subscribe to it directly instead of mirroring it in React state.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

const getTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light")
// The server can't know the theme; render a neutral label until hydrated.
const getServerTheme = (): Theme | null => null

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.add("theme-switching")
  root.classList.toggle("dark", theme === "dark")
  // Two frames: one to paint the new colours with transitions off, one to restore them.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")))
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme)

  // Follow the OS setting until the user picks a theme explicitly.
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)")
    const onChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(THEME_STORAGE_KEY)) applyTheme(e.matches ? "dark" : "light")
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const toggle = () => {
    const next: Theme = getTheme() === "dark" ? "light" : "dark"
    applyTheme(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode); the switch still applies for this visit.
    }
  }

  const label =
    theme === null ? "Toggle colour theme" : theme === "dark" ? "Switch to light theme" : "Switch to dark theme"

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={label} title={label} data-testid="theme-toggle">
      <Sun className="hidden dark:block" aria-hidden />
      <Moon className="block dark:hidden" aria-hidden />
    </Button>
  )
}
