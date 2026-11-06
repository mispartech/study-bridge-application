"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { clearAnalytics } from "@/lib/analytics/consent"
import { supabaseBrowser } from "@/lib/auth/client"

export function SignOutButton() {
  const router = useRouter()
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await supabaseBrowser().auth.signOut()
        clearAnalytics()
        router.replace("/")
        router.refresh()
      }}
    >
      Sign out
    </Button>
  )
}
