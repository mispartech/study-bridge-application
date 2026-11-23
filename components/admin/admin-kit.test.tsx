import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { change } from "@/lib/admin/change"

import { ConfirmDialog } from "./confirm-dialog"
import { DataTable, type Column } from "./data-table"
import { KpiTile } from "./kpi-tile"
import { StatusBadge, toneFor } from "./status-badge"

type Row = { id: string; email: string; n: number }
const rows: Row[] = [
  { id: "1", email: "b@example.com", n: 2 },
  { id: "2", email: "a@example.com", n: 10 },
]
const columns: Column<Row>[] = [
  { key: "email", header: "Email", sort: (r) => r.email, cell: (r) => r.email },
  { key: "n", header: "Searches", align: "right", sort: (r) => r.n, cell: (r) => r.n },
  { key: "plan", header: "Plan", cell: () => "free" },
]

describe("DataTable", () => {
  it("renders each row once, labelled for the phone card layout", () => {
    render(
      <DataTable
        label="Users"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowProps={() => ({ "data-testid": "user-row" })}
        path="/admin/users"
        params={{}}
      />
    )
    expect(screen.getAllByTestId("user-row")).toHaveLength(2)
    const cells = within(screen.getAllByTestId("user-row")[0]!).getAllByRole("cell")
    expect(cells.map((c) => c.getAttribute("data-label"))).toEqual(["Email", "Searches", "Plan"])
  })

  it("sorts on the server from the URL and marks the sorted column", () => {
    render(
      <DataTable
        label="Users"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        path="/admin/users"
        params={{ sort: "email", dir: "asc", q: "x" }}
      />
    )
    const body = screen.getAllByRole("row").slice(1)
    expect(body.map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(["a@example.com", "b@example.com"])
    expect(screen.getByRole("columnheader", { name: /Email/ })).toHaveAttribute("aria-sort", "ascending")
    // The header link flips the direction and keeps the search.
    expect(screen.getByRole("link", { name: /Email/ })).toHaveAttribute("href", "/admin/users?q=x&sort=email&dir=desc")
    expect(screen.getByRole("link", { name: /Searches/ })).toHaveAttribute("href", "/admin/users?q=x&sort=n&dir=asc")
  })

  it("hides the columns the viewer turned off, never the first", () => {
    render(
      <DataTable
        label="Users"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        path="/admin/users"
        params={{ cols: "1", show: "n" }}
      />
    )
    expect(screen.queryByRole("columnheader", { name: "Plan" })).toBeNull()
    expect(screen.getByRole("columnheader", { name: /Email/ })).toBeInTheDocument()
  })

  it("pages long tables, keeping the filters in the links", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), email: `u${i}@example.com`, n: i }))
    render(
      <DataTable
        label="Users"
        columns={columns}
        rows={many}
        rowKey={(r) => r.id}
        path="/admin/users"
        params={{ q: "u" }}
        pageSize={25}
      />
    )
    expect(screen.getAllByRole("row")).toHaveLength(26)
    expect(screen.getByText("1–25 of 60")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/admin/users?q=u&page=2")
  })

  it("says so when there is nothing to show", () => {
    render(
      <DataTable
        label="Users"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        path="/x"
        params={{}}
        empty="No users"
      />
    )
    expect(screen.getByText("No users")).toBeInTheDocument()
    expect(screen.queryByRole("table")).toBeNull()
  })
})

describe("KpiTile", () => {
  it("says in words whether the change is good or bad, not only in colour", () => {
    render(<KpiTile label="Error reports" value="8" change={change(8, 4, "down")} />)
    expect(screen.getByText("+100%")).toBeInTheDocument()
    expect(screen.getByText("vs previous period")).toBeInTheDocument()
    expect(screen.getByText("+100%").closest("p")).toHaveClass("text-danger-strong")
  })
})

describe("StatusBadge", () => {
  it("maps known statuses to tones and leaves the rest neutral", () => {
    expect(toneFor("failed")).toBe("danger")
    expect(toneFor("sent")).toBe("success")
    expect(toneFor("queued")).toBe("warning")
    expect(toneFor("something new")).toBe("neutral")
    render(<StatusBadge tone="danger">failed</StatusBadge>)
    expect(screen.getByText("failed")).toHaveClass("text-danger-strong")
  })
})

describe("ConfirmDialog", () => {
  beforeAll(() => {
    // jsdom has no modal dialogs; open and close by attribute instead.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "")
    }
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open")
    }
  })

  it("keeps a destructive action disabled until the word is typed", async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        trigger="Delete"
        title="Delete this report?"
        confirmLabel="Delete for good"
        tone="danger"
        typed="DELETE"
        onConfirm={onConfirm}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    const confirm = screen.getByRole("button", { name: "Delete for good", hidden: true })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledOnce())
  })
})
