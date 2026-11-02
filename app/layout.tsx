import type { Metadata, Viewport } from "next"
import { Inter, Plus_Jakarta_Sans } from "next/font/google"

import { themeInitScript } from "@/lib/theme"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
})

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
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
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
