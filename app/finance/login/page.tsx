'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { authenticate } from './actions'

export default function FinanceLoginPage() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <form
        className="w-full max-w-sm space-y-4 bg-card border border-border rounded-lg p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setErr('')
          const res = await authenticate(pw)
          setBusy(false)
          if (res.ok) router.push('/finance')
          else setErr('Wrong password')
        }}
      >
        <h1 className="text-xl font-semibold text-foreground">Finance</h1>
        <Input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password"
          className="bg-secondary border-border"
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Checking…' : 'Enter'}
        </Button>
      </form>
    </div>
  )
}
