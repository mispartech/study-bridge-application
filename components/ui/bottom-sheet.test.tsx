import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { BottomSheet } from "./bottom-sheet"
import { Button } from "./button"

// Simulate a slow network: the lazily loaded motion code never arrives.
vi.mock("./motion-features", () => new Promise(() => {}))

describe("BottomSheet before animation code loads", () => {
  it("still opens and closes (with Escape and the close button)", async () => {
    const user = userEvent.setup()
    render(
      <BottomSheet trigger={<Button>Open</Button>} title="Costs" description="Breakdown">
        Body
      </BottomSheet>
    )

    await user.click(screen.getByRole("button", { name: "Open" }))
    expect(screen.getByRole("dialog", { name: "Costs" })).toHaveAccessibleDescription("Breakdown")
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus()

    await user.click(screen.getByRole("button", { name: "Open" }))
    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
