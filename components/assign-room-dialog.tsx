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
import { Search, BedDouble, X } from 'lucide-react'

interface Props {
  guest: Guest | null
  rooms: Room[]
  bookings: Booking[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

// Count occupants per room (bookings that aren't cancelled).
function occupantsByRoom(bookings: Booking[]): Map<string, Booking[]> {
  const map = new Map<string, Booking[]>()
  for (const b of bookings) {
    if (b.status === 'cancelled') continue
    const list = map.get(b.room_id) ?? []
    list.push(b)
    map.set(b.room_id, list)
  }
  return map
}

export function AssignRoomDialog({ guest, rooms, bookings, open, onOpenChange, onChanged }: Props) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const occupants = useMemo(() => occupantsByRoom(bookings), [bookings])

  const currentBooking = useMemo(() => {
    if (!guest) return null
    return bookings.find((b) => b.guest_id === guest.id && b.status !== 'cancelled') ?? null
  }, [guest, bookings])

  // Only show rooms that match the guest's hotel, are not staff, and aren't full.
  const candidates = useMemo(() => {
    if (!guest) return []
    const term = search.toLowerCase()
    return rooms
      .filter((r) => !r.is_staff)
      .filter((r) => (guest.hotel ? r.hotel === guest.hotel : true))
      .filter((r) => r.room_number.toLowerCase().includes(term))
      .sort((a, b) => Number(a.room_number) - Number(b.room_number))
  }, [rooms, guest, search])

  async function assign(room: Room) {
    if (!guest) return
    if (!guest.check_in_date || !guest.check_out_date) return
    setBusy(room.id)

    // If the guest already has a booking, change that booking's room.
    // Also handle the "single occupancy" case: a SINGLE-ticket guest alone
    // in a double tags the room as single (capacity 1) so no one else can
    // be added; the previous room (if any) is unwound back to double.
    let previousRoomId: string | null = null
    if (currentBooking) {
      previousRoomId = currentBooking.room_id
      await supabase
        .from('bookings')
        .update({ room_id: room.id })
        .eq('id', currentBooking.id)
    } else {
      await supabase.from('bookings').insert({
        guest_id: guest.id,
        room_id: room.id,
        check_in_date: guest.check_in_date,
        check_out_date: guest.check_out_date,
        status: 'confirmed',
      })
    }

    // Tag new room as single if applicable
    const occupantsInNewRoom = (occupants.get(room.id)?.length ?? 0) +
      (previousRoomId === room.id ? 0 : 1) -
      (previousRoomId === room.id ? 1 : 0)
    if (
      occupantsInNewRoom === 1 &&
      guest.ticket_type.toUpperCase().includes('SINGLE ROOM') &&
      room.room_type === 'double'
    ) {
      await supabase.from('rooms').update({ room_type: 'single', capacity: 1 }).eq('id', room.id)
    }
    // Revert previous room if it was a single and is now empty
    if (previousRoomId && previousRoomId !== room.id) {
      const prevOccupants = (occupants.get(previousRoomId)?.length ?? 1) - 1
      const prevRoom = rooms.find((r) => r.id === previousRoomId)
      if (prevRoom?.room_type === 'single' && prevOccupants === 0) {
        await supabase.from('rooms').update({ room_type: 'double', capacity: 2 }).eq('id', previousRoomId)
      }
    }

    setBusy(null)
    onChanged()
    onOpenChange(false)
  }

  async function unassign() {
    if (!currentBooking) return
    setBusy('unassign')
    const roomId = currentBooking.room_id
    await supabase.from('bookings').delete().eq('id', currentBooking.id)
    // If this was the last occupant of a single-tagged room, revert to double.
    const room = rooms.find((r) => r.id === roomId)
    const remaining = (occupants.get(roomId)?.length ?? 1) - 1
    if (room?.room_type === 'single' && remaining === 0) {
      await supabase.from('rooms').update({ room_type: 'double', capacity: 2 }).eq('id', roomId)
    }
    setBusy(null)
    onChanged()
    onOpenChange(false)
  }

  if (!guest) return null

  const noRoomGuest = !guest.hotel || !guest.check_in_date

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Assign room · <span className="text-primary">{guest.full_name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-3 flex flex-wrap gap-3">
          <span>{guest.ticket_type}</span>
          {guest.hotel && <span>· {guest.hotel}</span>}
          {guest.check_in_date && guest.check_out_date && (
            <span>
              · {guest.check_in_date} → {guest.check_out_date}
            </span>
          )}
        </div>

        {noRoomGuest ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-4 text-sm text-amber-300">
            This guest has no accommodation (RAVEPASS or missing dates) — nothing to assign.
          </div>
        ) : (
          <>
            {currentBooking && (
              <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-md p-3 mb-3">
                <div className="text-sm">
                  Currently in room{' '}
                  <span className="font-mono font-semibold text-foreground">
                    {rooms.find((r) => r.id === currentBooking.room_id)?.room_number ?? '?'}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                  onClick={unassign}
                  disabled={busy === 'unassign'}
                >
                  <X className="size-4 mr-1" />
                  Remove
                </Button>
              </div>
            )}

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search rooms by number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-secondary border-border"
              />
            </div>

            <div className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {candidates.map((room) => {
                const occ = occupants.get(room.id) ?? []
                const full = occ.length >= room.capacity
                const isCurrent = currentBooking?.room_id === room.id
                return (
                  <button
                    key={room.id}
                    onClick={() => !full && !isCurrent && assign(room)}
                    disabled={full || isCurrent || busy === room.id}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      isCurrent ? 'bg-blue-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BedDouble className="size-4 text-muted-foreground" />
                      <span className="font-mono font-semibold text-foreground">{room.room_number}</span>
                      <span className="text-xs text-muted-foreground capitalize">{room.hotel}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`rounded-md px-2 py-0.5 border ${
                          full
                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {occ.length}/{room.capacity} occupants
                      </span>
                      {isCurrent && <span className="text-blue-400">current</span>}
                    </div>
                  </button>
                )
              })}
              {candidates.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No matching rooms
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
