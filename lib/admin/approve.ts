import "server-only"

import { changedFields } from "@/lib/admin/field-changes"
import { toCityCostRows } from "@/lib/admin/city-costs"
import { toHealthCoverRow } from "@/lib/admin/health-cover"
import { PublishError, toRows } from "@/lib/admin/publish"
import type { Json } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"

/** What happened to one approval: published, or why not (a message a reviewer can act on). */
export type ApproveResult = { ok: true; programme_id?: string } | { ok: false; error: string }

const needsUniversity = "Approve a programme from this university first"

async function universityByDomain(domain: string) {
  const { data } = await serviceClient()
    .from("university")
    .select("id")
    .eq("is_demo", false)
    .contains("official_domains", [domain])
    .maybeSingle()
  return data
}

async function markApproved(id: string, reviewer: string, proposed: unknown, record: unknown) {
  const { error } = await serviceClient()
    .from("review_queue")
    .update({
      status: "approved",
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      field_changes: changedFields(proposed, record),
    })
    .eq("id", id)
    .eq("status", "pending")
  if (error) throw error
}

/** A programme, its university, requirement, intakes and fees, in one transaction. */
async function approveProgramme(id: string, reviewer: string, proposed: unknown, record: unknown) {
  const rows = toRows(record)
  const { data, error } = await serviceClient().rpc("publish_review_item", {
    p_review_id: id,
    p_reviewer: reviewer,
    p_university: rows.university as unknown as Json,
    p_programme: rows.programme as unknown as Json,
    p_requirement: rows.requirement as unknown as Json,
    p_intakes: rows.intakes as unknown as Json,
    p_fees: rows.fees as unknown as Json,
    p_field_changes: changedFields(proposed, record),
  })
  if (error) return { ok: false, error: error.message } as const
  return { ok: true, programme_id: data } as const
}

/** A university's own costs replace its previous ones. */
async function approveCityCosts(id: string, reviewer: string, proposed: unknown, record: unknown) {
  const { domain, rows } = toCityCostRows(record)
  const university = await universityByDomain(domain)
  if (!university) return { ok: false, error: needsUniversity } as const
  const db = serviceClient()
  const now = new Date().toISOString()
  const { error: removeError } = await db.from("city_cost").delete().eq("university_id", university.id)
  if (removeError) throw removeError
  const { error } = await db
    .from("city_cost")
    .insert(rows.map((row) => ({ ...row, university_id: university.id, last_verified_at: now })))
  if (error) return { ok: false, error: error.message } as const
  await markApproved(id, reviewer, proposed, record)
  return { ok: true } as const
}

/** A university's compulsory health plan replaces its previous one, and takes priority over the province. */
async function approveHealthCover(id: string, reviewer: string, proposed: unknown, record: unknown) {
  const { domain, row } = toHealthCoverRow(record)
  const university = await universityByDomain(domain)
  if (!university) return { ok: false, error: needsUniversity } as const
  const db = serviceClient()
  const { error: removeError } = await db
    .from("cost_estimate")
    .delete()
    .eq("university_id", university.id)
    .eq("item", "health_cover")
  if (removeError) throw removeError
  const { error } = await db
    .from("cost_estimate")
    .insert({ ...row, university_id: university.id, last_verified_at: new Date().toISOString() })
  if (error) return { ok: false, error: error.message } as const
  await markApproved(id, reviewer, proposed, record)
  return { ok: true } as const
}

/**
 * Publishes one review item as `record` (the reviewer's edited version, or the proposal unchanged).
 * Validation problems come back as `{ ok: false }`; unexpected database failures throw.
 */
export async function approveItem(
  item: { id: string; table_name: string; proposed: unknown },
  reviewer: string,
  record: unknown
): Promise<ApproveResult> {
  try {
    if (item.table_name === "city_cost") return await approveCityCosts(item.id, reviewer, item.proposed, record)
    if (item.table_name === "health_cover") return await approveHealthCover(item.id, reviewer, item.proposed, record)
    return await approveProgramme(item.id, reviewer, item.proposed, record)
  } catch (err) {
    if (err instanceof PublishError) return { ok: false, error: err.message }
    throw err
  }
}

/** True when a record would pass validation as it stands. (A cost or health plan still needs its university.) */
export function isReady(item: { table_name: string; proposed: unknown }): boolean {
  const convert = { programme: toRows, city_cost: toCityCostRows, health_cover: toHealthCoverRow }[item.table_name]
  if (!convert) return false
  try {
    convert(item.proposed)
    return true
  } catch {
    return false
  }
}

/** Order for a bulk approval: programmes first, because costs and health plans need their university. */
export const APPROVAL_ORDER: Record<string, number> = { programme: 0, city_cost: 1, health_cover: 2 }
