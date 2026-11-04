// Scans staged files (or every tracked and untracked file with --all) for credentials: known key
// shapes, database URLs with passwords, and the literal values in .env.local. Exits 1 on a hit.
// Prints file and rule only, never the matched value.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"

const RULES = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["GitHub token", /gh[pousr]_[0-9A-Za-z]{36}/],
  ["Slack token", /xox[baprs]-[0-9A-Za-z-]{10,}/],
  ["AI provider key", /sk-(?:ant|or|proj)-[0-9A-Za-z_-]{20,}/],
  ["JWT", /eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Database URL with password", /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/],
]
// Made-up credentials in the test that covers URL encoding.
const ALLOW = [["Database URL with password", "ingest/tests/test_pipeline_units.py"]]
const SKIP = /(^|\/)(package-lock\.json|uv\.lock)$|\.(png|jpe?g|ico|woff2?|crt)$/

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 })
const files = process.argv.includes("--all")
  ? git("ls-files", "--cached", "--others", "--exclude-standard")
  : git("diff", "--cached", "--name-only", "--diff-filter=ACMR")

const envValues = existsSync(".env.local")
  ? readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter((m) => m && !m[1].startsWith("NEXT_PUBLIC_"))
      .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")])
      .filter(([, value]) => value.length >= 8)
  : []

let hits = 0
let scanned = 0
for (const file of files.split("\n").filter(Boolean)) {
  if (SKIP.test(file) || !existsSync(file) || !statSync(file).isFile()) continue
  scanned++
  const text = readFileSync(file, "utf8")
  for (const [rule, pattern] of RULES) {
    if (pattern.test(text) && !ALLOW.some(([r, f]) => r === rule && f === file)) {
      console.error(`${file}: ${rule}`)
      hits++
    }
  }
  for (const [name, value] of envValues) {
    if (text.includes(value)) {
      console.error(`${file}: value of ${name} from .env.local`)
      hits++
    }
  }
}
console.log(`secret scan: ${scanned} files, ${hits} hit(s)`)
process.exit(hits ? 1 : 0)
