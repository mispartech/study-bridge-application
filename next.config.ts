import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // Inlined so the first paint needs one round trip. On Slow 3G a stylesheet request alone costs 2s.
    inlineCss: true,
  },
  turbopack: {
    // Pin the root: a stray lockfile higher up the tree would otherwise be picked as the workspace root.
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
