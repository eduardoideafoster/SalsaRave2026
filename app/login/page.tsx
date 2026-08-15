'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

/**
 * Real Supabase sign-in. The database only answers to an authenticated
 * session now, so this is what stands between the guest list and the
 * open internet — the anon key alone is no longer enough.
 */
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/'

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <form
        className="w-full max-w-sm space-y-4 bg-card border border-border rounded-lg p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setErr('')
          const supabase = createClient()
          const { error } = await supabase.auth.signInWithPassword({ email, password })
          setBusy(false)
          if (error) {
            setErr('Wrong email or password')
            return
          }
          router.push(next)
          router.refresh()
        }}
      >
        <h1 className="text-xl font-semibold text-foreground">SalsaRave Rooming</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue.</p>
        <Input
          type="email"
          autoFocus
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="bg-secondary border-border"
        />
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="bg-secondary border-border"
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}

// useSearchParams needs a Suspense boundary or the page cannot be
// prerendered.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
