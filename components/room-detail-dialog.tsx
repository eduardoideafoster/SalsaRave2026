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
import { Search, X, BedDouble } from 'lucide-react'

interface Props {
  room: Room | null
  rooms: Room[]
  guests: Guest[]
  bookings: Booking[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

export function RoomDetailDialog({
  room,
  rooms,
  guests,
  bookings,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const activeBookings = useMemo(
    () => bookings.filter((b) => b.status !== 'cancelled'),
    [bookings],
  )

  const occupantsInRoom = useMemo(() => {
    if (!room) return []
    return activeBookings
      .filter((b) => b.room_id === room.id)
      .map((b) => ({
        booking: b,
        guest: guests.find((g) => g.id === b.guest_id),
      }))
      .filter((x): x is { booking: Booking; guest: Guest } => !!x.guest)
  }, [room, activeBookings, guests])

  const candidateGuests = useMemo(() => {
    if (!room) return []
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return guests
      .filter((g) => {
        const inThisRoom = activeBookings.some(
          (b) => b.guest_id === g.id && b.room_id === room.id,
        )
        if (inThisRoom) return false
        return (
          g.full_name.toLowerCase().includes(q) ||
          g.order_code.toLowerCase().includes(q)
        )
      })
      .slice(0, 30)
  }, [room, guests, activeBookings, search])

  if (!room) return null
  const free = room.capacity - occupantsInRoom.length

  async function remove(bookingId: string) {
    setBusy(bookingId)
    await supabase.from('bookings').delete().eq('id', bookingId)
    setBusy(null)
    onChanged()
  }

  async function addGuest(g: Guest) {
    if (!room || free <= 0) return
    setBusy(g.id)
    const existing = activeBookings.find((b) => b.guest_id === g.id)
    if (existing) {
      await supabase.from('bookings').delete().eq('id', existing.id)
    }
    const checkIn = g.check_in_date ?? '2026-09-11'
    const checkOut = g.check_out_date ?? '2026-09-14'
    await supabase.from('bookings').insert({
      guest_id: g.id,
      room_id: room.id,
      check_in_date: checkIn,
      check_out_date: checkOut,
      status: 'confirmed',
    })
    if (g.hotel !== room.hotel) {
      await supabase.from('guests').update({ hotel: room.hotel }).eq('id', g.id)
    }
    setSearch('')
    setBusy(null)
    onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Room <span className="font-mono">{room.room_number}</span>{' '}
            <span className="text-sm text-muted-foreground font-normal">
              · {room.hotel} · {room.room_type} · {occupantsInRoom.length}/{room.capacity}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          {occupantsInRoom.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No guests assigned.</div>
          ) : (
            occupantsInRoom.map(({ booking, guest }) => (
              <div
                key={booking.id}
                className="flex items-center justify-between bg-secondary/30 border border-border rounded-md px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {guest.full_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    Order {guest.order_code} · {guest.ticket_type}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => remove(booking.id)}
                  disabled={busy === booking.id}
                >
                  <X className="size-4 mr-1" />
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4">
          <div className="text-xs text-muted-foreground uppercase mb-1 tracking-wider">
            {free > 0
              ? `Add guest (${free} spot${free === 1 ? '' : 's'} free)`
              : 'Room is full — remove someone first'}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search guests by name or order…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-secondary border-border"
              disabled={free <= 0}
            />
          </div>
          {candidateGuests.length > 0 && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {candidateGuests.map((g) => {
                const currentBooking = activeBookings.find((b) => b.guest_id === g.id)
                const currentRoom = currentBooking
                  ? rooms.find((r) => r.id === currentBooking.room_id)
                  : null
                return (
                  <button
                    key={g.id}
                    onClick={() => addGuest(g)}
                    disabled={busy === g.id || free <= 0}
                    className="w-full text-left px-3 py-2 hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {g.full_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Order {g.order_code} · {g.ticket_type}
                        {currentRoom && (
                          <>
                            {' '}
                            · <span className="text-amber-400">currently in {currentRoom.room_number}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <BedDouble className="size-4 text-muted-foreground shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
