'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Guest, Tribe, TRIBES } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ROLES: Guest['role'][] = ['Leader', 'Follower', 'Both']
const TICKET_TYPES = [
  'CORE TRIBE',
  'RAVEPASS',
  'RAVEPASS EXTENSION',
  'SINGLE ROOM 3 NIGHTS',
  'SINGLE ROOM 4 NIGHTS',
  'DOUBLE ROOM 3 NIGHTS',
  'DOUBLE ROOM 4 NIGHTS',
  'TRIPLE ROOM 3 NIGHTS',
  'TRIPLE ROOM 4 NIGHTS',
  'UPGRADED SINGLE ROOM 3 NIGHTS',
  'UPGRADED SINGLE ROOM 4 NIGHTS',
  'UPGRADED DOUBLE ROOM 3 NIGHTS',
  'UPGRADED DOUBLE ROOM 4 NIGHTS',
]

interface Props {
  guest: Guest | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function GuestEditDialog({ guest, open, onOpenChange, onSaved }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState<Partial<Guest>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (guest) setForm(guest)
  }, [guest])

  if (!guest) return null

  const save = async () => {
    setBusy(true)
    const patch: Partial<Guest> = { ...form }
    const { error } = await supabase.from('guests').update(patch).eq('id', guest.id)
    if (!error) {
      // Mirror date changes onto active bookings (same behaviour as the old inline edit).
      const bookingPatch: { check_in_date?: string; check_out_date?: string } = {}
      if (patch.check_in_date) bookingPatch.check_in_date = patch.check_in_date
      if (patch.check_out_date) bookingPatch.check_out_date = patch.check_out_date
      if (Object.keys(bookingPatch).length > 0) {
        await supabase
          .from('bookings')
          .update(bookingPatch)
          .eq('guest_id', guest.id)
          .neq('status', 'cancelled')
      }
      onSaved()
      onOpenChange(false)
    }
    setBusy(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit guest</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Order code">
            <Input
              value={form.order_code ?? ''}
              onChange={(e) => setForm({ ...form, order_code: e.target.value })}
              className="bg-secondary border-border"
            />
          </Field>
          <Field label="Full name">
            <Input
              value={form.full_name ?? ''}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="bg-secondary border-border"
            />
          </Field>
          <Field label="Role">
            <Select
              value={form.role ?? 'Follower'}
              onValueChange={(v) => setForm({ ...form, role: v as Guest['role'] })}
            >
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Country">
            <Input
              value={form.country ?? ''}
              onChange={(e) => setForm({ ...form, country: e.target.value || null })}
              className="bg-secondary border-border"
            />
          </Field>
          <Field label="Ticket type">
            <Select
              value={form.ticket_type ?? ''}
              onValueChange={(v) => setForm({ ...form, ticket_type: v })}
            >
              <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="bg-card border-border max-h-72">
                {TICKET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Hotel">
            <Select
              value={form.hotel ?? '__none__'}
              onValueChange={(v) => setForm({ ...form, hotel: v === '__none__' ? null : (v as 'H3' | 'H4') })}
            >
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="__none__">None</SelectItem>
                <SelectItem value="H3">H3</SelectItem>
                <SelectItem value="H4">H4</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tribe">
            <Select
              value={form.tribe ?? '__none__'}
              onValueChange={(v) => setForm({ ...form, tribe: v === '__none__' ? null : (v as Tribe) })}
            >
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="__none__">No tribe</SelectItem>
                {TRIBES.map((tr) => <SelectItem key={tr} value={tr}>{tr}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Check-in">
            <Input
              type="date"
              value={form.check_in_date ?? ''}
              onChange={(e) => setForm({ ...form, check_in_date: e.target.value || null })}
              className="bg-secondary border-border"
            />
          </Field>
          <Field label="Check-out">
            <Input
              type="date"
              value={form.check_out_date ?? ''}
              onChange={(e) => setForm({ ...form, check_out_date: e.target.value || null })}
              className="bg-secondary border-border"
            />
          </Field>
        </div>

        <DialogFooter className="mt-2 flex gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}
