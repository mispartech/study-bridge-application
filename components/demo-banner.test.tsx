import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DemoBanner } from "./demo-banner"

afterEach(() => vi.unstubAllEnvs())

describe("DemoBanner", () => {
  it("shows when demo mode is on", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    render(<DemoBanner />)
    expect(screen.getByText("Demo data — not real programmes")).toBeTruthy()
  })

  it("stays hidden otherwise", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false")
    const { container } = render(<DemoBanner />)
    expect(container.firstChild).toBeNull()
  })
})
