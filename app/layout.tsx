import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"

import { themeInitScript } from "@/lib/theme"
import "./globals.css"

// Self-hosted, with only the character sets StudyBridge uses: every @font-face line ships inside the
// first page, which matters on Slow 3G. Inter's Latin-extended file is what carries the ₦ sign.
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
})

const interExtended = localFont({
  src: "./fonts/inter-latin-ext.woff2",
  variable: "--font-inter-ext",
  weight: "100 900",
  display: "swap",
  preload: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
})

const jakarta = localFont({
  src: "./fonts/jakarta-latin.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
})

export const metadata: Metadata = {
  title: { default: "StudyBridge", template: "%s · StudyBridge" },
  description: "Find Master's programmes in the UK, Canada and USA that fit your grades and budget.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F7FC" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0D1C" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script changes the class before hydration.
    <html
      lang="en"
      className={`${inter.variable} ${interExtended.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
