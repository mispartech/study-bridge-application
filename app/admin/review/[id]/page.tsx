import { notFound } from "next/navigation"
import { connection } from "next/server"

import { Breadcrumbs } from "@/components/admin/page-header"
import { ReviewEditor } from "@/components/admin/review-editor"
import { serviceClient } from "@/lib/db/service"
import { requireStaff } from "@/lib/auth/staff-page"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  await requireStaff("content")
  const { id } = await params
  const { data: item } = await serviceClient().from("review_queue").select("*").eq("id", id).maybeSingle()
  if (!item) notFound()
  const sources = (item.proposed as { source_urls?: string[] }).source_urls ?? []
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/review", label: "Review queue" }]} />
      <ReviewEditor
        id={item.id}
        status={item.status}
        reason={item.reason}
        initial={JSON.stringify(item.proposed, null, 2)}
        current={item.current ? JSON.stringify(item.current, null, 2) : null}
        sourceUrl={sources[0] ?? null}
        sourceText={item.source_text}
      />
    </>
  )
}
