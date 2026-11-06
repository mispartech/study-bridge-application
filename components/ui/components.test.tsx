import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { isActive } from "@/components/shell/nav-items"
import { Button } from "./button"
import { Chip } from "./chip"
import { FitRing } from "./fit-ring"
import { FreshnessBadge } from "./freshness-badge"
import { Money } from "./money"
import { clampPercent, ProgressRing } from "./progress-ring"
import { VisaStatusChip } from "./visa-status-chip"

const now = new Date("2026-11-02T12:00:00Z")

describe("Button", () => {
  it("disables and marks busy while loading", () => {
    render(<Button loading>Save</Button>)
    const button = screen.getByRole("button", { name: "Save" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
  })

  it("renders its child when asChild", () => {
    render(
      <Button asChild>
        <a href="https://example.org/apply">Apply</a>
      </Button>
    )
    expect(screen.getByRole("link", { name: "Apply" })).toHaveAttribute("href", "https://example.org/apply")
  })
})

describe("Chip", () => {
  it("exposes its variant for styling and tests", () => {
    render(<Chip variant="danger">Over budget</Chip>)
    expect(screen.getByText("Over budget").closest("[data-slot=chip]")).toHaveAttribute("data-variant", "danger")
  })
})

describe("Money", () => {
  it("renders formatted text with machine-readable value", () => {
    render(<Money amountMinor={450_000_000n} currency="NGN" />)
    const el = screen.getByText("₦4,500,000")
    expect(el).toHaveAttribute("value", "450000000 NGN")
    expect(el).toHaveClass("money")
  })
})

describe("ProgressRing", () => {
  it("clamps percentages", () => {
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(-5)).toBe(0)
    expect(clampPercent(3, 8)).toBe(37.5)
    expect(clampPercent(Number.NaN)).toBe(0)
    expect(clampPercent(1, 0)).toBe(0)
  })

  it("is an accessible progressbar", () => {
    render(<ProgressRing value={3} max={8} label="Documents uploaded" />)
    const bar = screen.getByRole("progressbar", { name: "Documents uploaded" })
    expect(bar).toHaveAttribute("aria-valuenow", "3")
    expect(bar).toHaveAttribute("aria-valuemax", "8")
  })
})

describe("FitRing", () => {
  it("announces score and band", () => {
    render(<FitRing score={82.4} band="strong" />)
    const bar = screen.getByRole("progressbar", { name: "Fit score, Strong match" })
    expect(bar).toHaveAttribute("aria-valuenow", "82")
    expect(bar).toHaveAttribute("aria-valuetext", "82 out of 100, Strong match")
  })

  it("clamps out-of-range scores", () => {
    render(<FitRing score={140} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
  })
})

describe("FreshnessBadge", () => {
  it("is green (success) under 90 days", () => {
    const { container } = render(<FreshnessBadge lastVerifiedAt="2026-10-21T12:00:00Z" now={now} />)
    expect(container.querySelector("[data-freshness]")).toHaveAttribute("data-freshness", "fresh")
    expect(container.querySelector("[data-slot=chip]")).toHaveAttribute("data-variant", "success")
    expect(screen.getByText("12 days ago")).toHaveAttribute("datetime", "2026-10-21T12:00:00.000Z")
  })

  it("is amber (warning) from 90 days with a screen-reader caution", () => {
    const { container } = render(<FreshnessBadge lastVerifiedAt="2026-08-04T12:00:00Z" now={now} />)
    expect(container.querySelector("[data-slot=chip]")).toHaveAttribute("data-variant", "warning")
    expect(screen.getByText(/Details may have changed/)).toHaveClass("sr-only")
  })

  it("links to the source in a new tab when given", () => {
    render(<FreshnessBadge lastVerifiedAt={now} now={now} sourceUrl="https://example.org/source" />)
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "https://example.org/source")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })
})

describe("VisaStatusChip", () => {
  it.each([
    ["open", "success", "Visa route open"],
    ["conditional", "warning", "Extra visa conditions"],
    ["suspended", "danger", "Visa issuance suspended"],
    ["unknown", "neutral", "Visa status unconfirmed"],
  ] as const)("%s → %s variant", (status, variant, text) => {
    const { container } = render(<VisaStatusChip status={status} />)
    expect(container.querySelector("[data-slot=chip]")).toHaveAttribute("data-variant", variant)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it("prefixes the destination", () => {
    render(<VisaStatusChip status="open" country="Country A" />)
    expect(screen.getByText("Country A: Visa route open")).toBeInTheDocument()
  })
})

describe("nav isActive", () => {
  it("matches the route and its children only", () => {
    expect(isActive("/discover", "/discover")).toBe(true)
    expect(isActive("/discover/abc", "/discover")).toBe(true)
    expect(isActive("/discovery", "/discover")).toBe(false)
  })
})
