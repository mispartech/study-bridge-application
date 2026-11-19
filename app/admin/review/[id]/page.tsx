import { notFound } from "next/navigation"
import { connection } from "next/server"

import { ReviewEditor } from "@/components/admin/review-editor"
import { serviceClient } from "@/lib/db/service"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  const { data: item } = await serviceClient().from("review_queue").select("*").eq("id", id).maybeSingle()
  if (!item) notFound()
  const sources = (item.proposed as { source_urls?: string[] }).source_urls ?? []
  return (
    <ReviewEditor
      id={item.id}
      status={item.status}
      reason={item.reason}
      initial={JSON.stringify(item.proposed, null, 2)}
      current={item.current ? JSON.stringify(item.current, null, 2) : null}
      sourceUrl={sources[0] ?? null}
      sourceText={item.source_text}
    />
  )
}
