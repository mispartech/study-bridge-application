import "server-only"

import { serviceClient } from "@/lib/db/service"
import type { Permission } from "@/lib/auth/roles"

import { funnel } from "./funnel"
import type { Range } from "./range"

type Dataset = {
  permission: Permission
  columns: string[]
  rows: (range: Range) => Promise<Record<string, unknown>[]>
}

/** Every CSV an admin page offers. Each one needs its page's permission, and each download is audited. */
export const DATASETS: Record<string, Dataset> = {
  funnel: {
    permission: "overview",
    columns: ["step", "people", "from_previous"],
    rows: async (range) => {
      const { data, error } = await serviceClient().rpc("activity_summary", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      })
      if (error) throw error
      const summary = (data ?? []).map((r) => ({ event: r.event, events: Number(r.events), actors: Number(r.actors) }))
      return funnel(summary).map((s) => ({
        step: s.label,
        people: s.people,
        from_previous: s.fromPrevious === null ? "" : s.fromPrevious.toFixed(3),
      }))
    },
  },
  reports: {
    permission: "users.read",
    columns: ["created_at", "email", "delivery_status", "claimed_at", "reminders_consent", "marketing_consent"],
    rows: async (range) => {
      const { data, error } = await serviceClient()
        .from("report")
        .select("created_at, email, delivery_status, claimed_at, reminders_consent, marketing_consent")
        .gte("created_at", range.from.toISOString())
        .lt("created_at", range.to.toISOString())
        .order("created_at", { ascending: false })
        .limit(10_000)
      if (error) throw error
      return data ?? []
    },
  },
  feedback: {
    permission: "overview",
    columns: ["event", "programme_id", "reason", "count"],
    rows: async (range) => {
      const { data, error } = await serviceClient().rpc("activity_by_target", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        p_events: ["programme_saved", "programme_dismissed", "apply_clicked", "suggestion_feedback"],
      })
      if (error) throw error
      return (data ?? []).map((r) => ({
        event: r.event,
        programme_id: r.target_id,
        reason: r.reason ?? "",
        count: Number(r.events),
      }))
    },
  },
  audit: {
    permission: "audit",
    columns: ["occurred_at", "staff_email", "action", "target_type", "target_id", "reason", "before", "after"],
    rows: async (range) => {
      const { data, error } = await serviceClient()
        .from("staff_audit")
        .select("occurred_at, staff_email, action, target_type, target_id, reason, before, after")
        .gte("occurred_at", range.from.toISOString())
        .lt("occurred_at", range.to.toISOString())
        .order("occurred_at", { ascending: false })
        .limit(10_000)
      if (error) throw error
      return data ?? []
    },
  },
}
