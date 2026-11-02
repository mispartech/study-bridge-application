// Lighthouse mobile audit of every /dev page against a running production server.
//
//   npm run build && npm run start -- --port 3100   (in another terminal)
//   npm run lighthouse                              # default mobile profile (Slow 4G)
//   npm run lighthouse -- --slow3g                  # stricter 3G profile from CLAUDE.md
//   npm run lighthouse -- --no-calibrate            # always use Lighthouse's stock 4x CPU slowdown
//
// CPU calibration: Lighthouse's stock 4x slowdown assumes a fast host (benchmark index ≈ 1500+)
// and warns when the host scores under 1000. On a slower host, 4x emulates a far weaker phone
// than intended, so we scale the multiplier to hit the same emulated device, per
// https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md#calibrating-multipliers
// CI runners are typically fast enough that calibration leaves 4x unchanged.
//
// Each page runs RUNS times (default 3) and reports the median, as Lighthouse recommends.
// Fails (exit 1) if any median is below 90 performance or 100 accessibility.
// HTML reports (median run) are written to lighthouse-reports/.

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { chromium } from "@playwright/test"
import * as chromeLauncher from "chrome-launcher"
import lighthouse from "lighthouse"

const BASE = process.env.LH_BASE_URL ?? "http://localhost:3100"
const SLOW_3G = process.argv.includes("--slow3g")
const CALIBRATE = !process.argv.includes("--no-calibrate")
const RUNS = Number(process.env.RUNS ?? 3)
const THRESHOLDS = { performance: 90, accessibility: 100 }
// Benchmark index of the emulated device under stock settings: a ~1500 host slowed 4x.
const TARGET_DEVICE_BENCHMARK = 1500 / 4
const STOCK_CPU_MULTIPLIER = 4
const ALL_PAGES = [
  "/dev",
  "/dev/tokens",
  "/dev/button",
  "/dev/chip",
  "/dev/card",
  "/dev/bottom-sheet",
  "/dev/progress-ring",
  "/dev/fit-ring",
  "/dev/money",
  "/dev/freshness-badge",
  "/dev/visa-status-chip",
]
// LH_PAGES="/dev/money,/dev/chip" audits a subset.
const PAGES = process.env.LH_PAGES ? process.env.LH_PAGES.split(",") : ALL_PAGES

const config = {
  extends: "lighthouse:default",
  settings: {
    onlyCategories: ["performance", "accessibility", "best-practices"],
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 360, height: 740, deviceScaleFactor: 3, disabled: false },
    throttling: {
      // Lighthouse mobile defaults (Slow 4G); --slow3g approximates DevTools "Slow 3G".
      ...(SLOW_3G ? { rttMs: 400, throughputKbps: 400 } : { rttMs: 150, throughputKbps: 1638.4 }),
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
      cpuSlowdownMultiplier: STOCK_CPU_MULTIPLIER,
    },
  },
}

const outDir = path.resolve("lighthouse-reports")
await mkdir(outDir, { recursive: true })

const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  chromeFlags: ["--headless=new", "--no-sandbox"],
})

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const multipliers = []

// Host speed drifts during a long audit (thermal throttling on laptops), so calibration is
// rolling: each run's measured benchmark index sets the multiplier for the next run.
function calibrate(benchmarkIndex) {
  if (!CALIBRATE || !(benchmarkIndex > 0)) return
  const calibrated = Math.round((benchmarkIndex / TARGET_DEVICE_BENCHMARK) * 10) / 10
  config.settings.throttling.cpuSlowdownMultiplier = Math.min(STOCK_CPU_MULTIPLIER, Math.max(1, calibrated))
}

async function run(page) {
  multipliers.push(config.settings.throttling.cpuSlowdownMultiplier)
  const result = await lighthouse(`${BASE}${page}`, { port: chrome.port, output: "html", logLevel: "error" }, config)
  calibrate(result?.lhr.environment.benchmarkIndex)
  return result
}

const rows = []
let failed = false
const benchmarks = []
try {
  // Warm-up run: primes the server and takes the first CPU measurement. Not scored.
  const warm = await lighthouse(`${BASE}${PAGES[0]}`, { port: chrome.port, logLevel: "error" }, config)
  calibrate(warm?.lhr.environment.benchmarkIndex)

  for (const page of PAGES) {
    const results = []
    for (let i = 0; i < RUNS; i++) {
      const result = await run(page)
      if (!result) throw new Error(`Lighthouse returned no result for ${page}`)
      benchmarks.push(result.lhr.environment.benchmarkIndex)
      results.push(result)
    }
    const perf = (r) => r.lhr.categories.performance.score ?? 0
    const mid = median(results.map(perf))
    const result = results.find((r) => perf(r) === mid)
    const { categories, audits } = result.lhr
    const score = (k) => Math.round((categories[k]?.score ?? 0) * 100)
    const row = {
      page,
      performance: score("performance"),
      range: `${Math.round(Math.min(...results.map(perf)) * 100)}–${Math.round(Math.max(...results.map(perf)) * 100)}`,
      accessibility: Math.min(...results.map((r) => Math.round((r.lhr.categories.accessibility.score ?? 0) * 100))),
      bestPractices: score("best-practices"),
      LCP: audits["largest-contentful-paint"].displayValue,
      TBT: audits["total-blocking-time"].displayValue,
      CLS: audits["cumulative-layout-shift"].displayValue,
    }
    const ok = row.performance >= THRESHOLDS.performance && row.accessibility >= THRESHOLDS.accessibility
    if (!ok) failed = true
    rows.push({ ...row, ok: ok ? "✓" : "✗" })
    const name = page.replace(/^\//, "").replace(/\//g, "_") || "root"
    await writeFile(path.join(outDir, `${name}${SLOW_3G ? ".slow3g" : ""}.html`), result.report)
  }
} finally {
  await chrome.kill()
}

const span = (xs) => `${Math.round(Math.min(...xs) * 10) / 10}–${Math.round(Math.max(...xs) * 10) / 10}`
console.log(
  `Lighthouse mobile${SLOW_3G ? " (slow 3G)" : ""} against ${BASE}, median of ${RUNS} runs\n` +
    `  host benchmark index ${span(benchmarks)}; CPU slowdown ${
      CALIBRATE
        ? `${span(multipliers)}x (calibrated, stock is ${STOCK_CPU_MULTIPLIER}x)`
        : `${STOCK_CPU_MULTIPLIER}x (stock)`
    }`
)
console.table(rows)
if (failed) {
  console.error(`Below threshold: performance ≥ ${THRESHOLDS.performance}, accessibility ≥ ${THRESHOLDS.accessibility}`)
  process.exit(1)
}
