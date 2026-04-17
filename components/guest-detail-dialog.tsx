'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Guest, Room, Booking } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BedDouble, UserPlus, UserMinus, ArrowRightLeft, Search, X } from 'lucide-react'

interface Props {
  guest: Guest | null
  rooms: Room[]
  guests: Guest[]
  bookings: Booking[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
  onRequestChangeRoom: (guest: Guest) => void
}

export function GuestDetailDialog({
  guest,
  rooms,
  guests,
  bookings,
  open,
  onOpenChange,
  onChanged,
  onRequestChangeRoom,
}: Props) {
  const supabase = createClient()
  const [addSearch, setAddSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const booking = useMemo(() => {
    if (!guest) return null
    return bookings.find((b) => b.guest_id === guest.id && b.status !== 'cancelled') ?? null
  }, [guest, bookings])

  const room = useMemo(() => {
    if (!booking) return null
    return rooms.find((r) => r.id === booking.room_id) ?? null
  }, [booking, rooms])

  // Other occupants of the same room
  const roommates = useMemo(() => {
    if (!room) return []
    return bookings
      .filter((b) => b.room_id === room.id && b.status !== 'cancelled' && b.guest_id !== guest?.id)
      .map((b) => ({ booking: b, guest: guests.find((g) => g.id === b.guest_id) }))
      .filter((x) => x.guest)
  }, [room, bookings, guests, guest])

  const totalInRoom = roommates.length + (booking ? 1 : 0)
  const freeBeds = room ? room.capacity - totalInRoom : 0

  // Candidates to add: unassigned guests in the same hotel with overlapping dates
  const assignedGuestIds = new Set(
    bookings.filter((b) => b.status !== 'cancelled').map((b) => b.guest_id),
  )
  const candidates = useMemo(() => {
    if (!room) return []
    const term = addSearch.toLowerCase()
    return guests
      .filter((g) => !assignedGuestIds.has(g.id))
      .filter((g) => g.hotel === room.hotel)
      .filter((g) => g.check_in_date && g.check_out_date)
      .filter((g) =>
        !term ||
        g.full_name.toLowerCase().includes(term) ||
        g.order_code.toLowerCase().includes(term),
      )
      .slice(0, 20)
  }, [guests, room, addSearch, bookings])

  async function addOccupant(g: Guest) {
    if (!room || !g.check_in_date || !g.check_out_date) return
    setBusy(g.id)
    await supabase.from('bookings').insert({
      guest_id: g.id,
      room_id: room.id,
      check_in_date: g.check_in_date,
      check_out_date: g.check_out_date,
      status: 'confirmed',
    })
    setBusy(null)
    setAddSearch('')
    onChanged()
  }

  async function removeOccupant(bookingId: string) {
    setBusy(bookingId)
    await supabase.from('bookings').delete().eq('id', bookingId)
    setBusy(null)
    onChanged()
  }

  if (!guest) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">{guest.full_name}</DialogTitle>
        </DialogHeader>

        {/* Guest info */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-secondary/30 rounded-md border border-border p-4">
          <Field label="Order">{guest.order_code}</Field>
          <Field label="Role">{guest.role}</Field>
          <Field label="Country">{guest.country ?? '—'}</Field>
          <Field label="Hotel">{guest.hotel ?? '—'}</Field>
          <Field label="Ticket">{guest.ticket_type}</Field>
          <Field label="Dates">
            {guest.check_in_date && guest.check_out_date
              ? `${guest.check_in_date} → ${guest.check_out_date}`
              : '—'}
          </Field>
        </div>

        {/* Room section */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Room</h3>
            {guest.hotel && guest.check_in_date && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-8"
                onClick={() => {
                  onOpenChange(false)
                  onRequestChangeRoom(guest)
                }}
              >
                <ArrowRightLeft className="size-3" />
                {room ? 'Change room' : 'Assign room'}
              </Button>
            )}
          </div>
          {room ? (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-4">
              <div className="flex items-center gap-2 mb-2">
                <BedDouble className="size-4 text-blue-400" />
                <span className="font-mono font-semibold text-lg text-foreground">{room.room_number}</span>
                <span className="text-xs text-muted-foreground">{room.hotel} · {room.room_type}</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-md border ${
                  freeBeds > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'
                }`}>
                  {totalInRoom}/{room.capacity} occupants
                </span>
              </div>
            </div>
          ) : guest.hotel && guest.check_in_date ? (
            <div className="text-sm text-muted-foreground bg-secondary/30 rounded-md border border-border p-3">
              No room assigned yet.
            </div>
          ) : (
            <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
              This guest has no accommodation (RAVEPASS or no dates).
            </div>
          )}
        </div>

        {/* Roommates */}
        {room && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Roommates ({roommates.length})
            </h3>
            {roommates.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">
                {guest.full_name} is alone in this room.
              </div>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border">
                {roommates.map(({ booking: b, guest: g }) => (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">{g!.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {g!.role} · {g!.country ?? '—'} · order {g!.order_code}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-red-400"
                      onClick={() => removeOccupant(b.id)}
                      disabled={busy === b.id}
                      title="Remove from room"
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add occupant */}
            {freeBeds > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus className="size-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Add another occupant · {freeBeds} bed{freeBeds > 1 ? 's' : ''} free
                  </span>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search unassigned guests (same hotel)..."
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    className="pl-10 bg-secondary border-border"
                  />
                </div>
                {addSearch && (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {candidates.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => addOccupant(g)}
                        disabled={busy === g.id}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary/50 disabled:opacity-50"
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">{g.full_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {g.role} · {g.country ?? '—'} · {g.ticket_type}
                          </div>
                        </div>
                        <UserPlus className="size-4 text-primary" />
                      </button>
                    ))}
                    {candidates.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                        No matching unassigned guests
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="size-4 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  )
}
