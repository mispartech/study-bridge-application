"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { supabaseBrowser } from "@/lib/auth/client"

export function SignOutButton() {
  const router = useRouter()
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await supabaseBrowser().auth.signOut()
        router.replace("/")
        router.refresh()
      }}
    >
      Sign out
    </Button>
  )
}
