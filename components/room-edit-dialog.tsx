'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Room } from '@/lib/types'
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

interface Props {
  room: Room | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function RoomEditDialog({ room, open, onOpenChange, onSaved }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState<Partial<Room>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (room) setForm(room)
  }, [room])

  if (!room) return null

  const save = async () => {
    setBusy(true)
    const { error } = await supabase.from('rooms').update(form).eq('id', room.id)
    if (!error) {
      onSaved()
      onOpenChange(false)
    }
    setBusy(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit room</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Room number">
            <Input
              value={form.room_number ?? ''}
              onChange={(e) => setForm({ ...form, room_number: e.target.value })}
              className="bg-secondary border-border"
            />
          </Field>
          <Field label="Hotel">
            <Select
              value={form.hotel ?? 'H3'}
              onValueChange={(v) => setForm({ ...form, hotel: v as 'H3' | 'H4' })}
            >
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="H3">H3</SelectItem>
                <SelectItem value="H4">H4</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Type">
            <Select
              value={form.room_type ?? 'double'}
              onValueChange={(v) => setForm({ ...form, room_type: v as Room['room_type'] })}
            >
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="single">single</SelectItem>
                <SelectItem value="double">double</SelectItem>
                <SelectItem value="triple">triple</SelectItem>
                <SelectItem value="quadruple">quadruple</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Capacity">
            <Input
              type="number"
              min={1}
              max={6}
              value={form.capacity ?? 2}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                setForm({ ...form, capacity: Number.isFinite(n) ? n : undefined })
              }}
              className="bg-secondary border-border"
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status ?? 'available'}
              onValueChange={(v) => setForm({ ...form, status: v as Room['status'] })}
            >
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="available">available</SelectItem>
                <SelectItem value="occupied">occupied</SelectItem>
                <SelectItem value="cleaning">cleaning</SelectItem>
                <SelectItem value="maintenance">maintenance</SelectItem>
                <SelectItem value="blocked">blocked</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Use">
            <Select
              value={form.is_staff ? 'staff' : 'guest'}
              onValueChange={(v) => setForm({ ...form, is_staff: v === 'staff' })}
            >
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="guest">guest</SelectItem>
                <SelectItem value="staff">staff</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Available from">
            <Input
              type="date"
              value={form.available_from ?? ''}
              onChange={(e) => setForm({ ...form, available_from: e.target.value })}
              className="bg-secondary border-border"
            />
          </Field>
          <Field label="Notes">
            <Input
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
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
