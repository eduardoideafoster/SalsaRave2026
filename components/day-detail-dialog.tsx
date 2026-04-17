'use client'

import { useMemo } from 'react'
import { Guest, Room, Booking } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { format, parseISO, isSameDay, isBefore } from 'date-fns'
import { LogIn, LogOut, BedDouble } from 'lucide-react'

interface Props {
  date: Date | null
  rooms: Room[]
  guests: Guest[]
  bookings: Booking[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DayDetailDialog({ date, rooms, guests, bookings, open, onOpenChange }: Props) {
  const data = useMemo(() => {
    if (!date) return null
    const activeBookings = bookings.filter((b) => b.status !== 'cancelled')

    // Check-ins: bookings whose check_in_date is this day
    const checkIns = activeBookings.filter((b) => isSameDay(parseISO(b.check_in_date), date))
    // Check-outs: bookings whose check_out_date is this day
    const checkOuts = activeBookings.filter((b) => isSameDay(parseISO(b.check_out_date), date))
    // Currently staying: check_in <= date < check_out
    const staying = activeBookings.filter((b) => {
      const ci = parseISO(b.check_in_date)
      const co = parseISO(b.check_out_date)
      return !isBefore(date, ci) && isBefore(date, co)
    })
    // Staff rooms "occupied" on this day (available_from <= date)
    const staffOccupiedRooms = rooms.filter(
      (r) => r.is_staff && !isBefore(date, parseISO(r.available_from)),
    )

    const enrich = (bs: Booking[]) =>
      bs
        .map((b) => ({
          booking: b,
          guest: guests.find((g) => g.id === b.guest_id),
          room: rooms.find((r) => r.id === b.room_id),
        }))
        .filter((x) => x.guest && x.room)

    return {
      checkIns: enrich(checkIns),
      checkOuts: enrich(checkOuts),
      staying: enrich(staying),
      staffOccupiedRooms,
    }
  }, [date, rooms, guests, bookings])

  if (!date || !data) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {format(date, 'EEEE, MMMM d, yyyy')}
          </DialogTitle>
        </DialogHeader>

        {/* Summary row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <SummaryChip
            label="Check-ins"
            value={data.checkIns.length}
            color="emerald"
            icon={<LogIn className="size-4" />}
          />
          <SummaryChip
            label="Check-outs"
            value={data.checkOuts.length}
            color="amber"
            icon={<LogOut className="size-4" />}
          />
          <SummaryChip
            label="Currently staying"
            value={data.staying.length}
            color="blue"
            icon={<BedDouble className="size-4" />}
          />
          <SummaryChip
            label="Staff rooms"
            value={data.staffOccupiedRooms.length}
            color="purple"
            icon={<BedDouble className="size-4" />}
          />
        </div>

        {/* Section: Check-ins */}
        <Section title={`Check-ins (${data.checkIns.length})`} emptyMessage="No check-ins this day.">
          {data.checkIns.map(({ booking: b, guest: g, room: r }) => (
            <PersonRow key={b.id} name={g!.full_name} sub={`Order ${g!.order_code} · ${g!.ticket_type}`} room={r!.room_number} />
          ))}
        </Section>

        {/* Section: Check-outs */}
        <Section title={`Check-outs (${data.checkOuts.length})`} emptyMessage="No check-outs this day.">
          {data.checkOuts.map(({ booking: b, guest: g, room: r }) => (
            <PersonRow key={b.id} name={g!.full_name} sub={`Order ${g!.order_code} · ${g!.ticket_type}`} room={r!.room_number} />
          ))}
        </Section>

        {/* Section: Staying (compact, grouped by room) */}
        <Section title={`Staying (${data.staying.length})`} emptyMessage="Nobody staying.">
          {(() => {
            const byRoom = new Map<string, typeof data.staying>()
            for (const s of data.staying) {
              const key = s.room!.id
              const arr = byRoom.get(key) ?? []
              arr.push(s)
              byRoom.set(key, arr)
            }
            const sorted = [...byRoom.entries()].sort(
              (a, b) => Number(a[1][0].room!.room_number) - Number(b[1][0].room!.room_number),
            )
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sorted.map(([roomId, stays]) => {
                  const r = stays[0].room!
                  return (
                    <div key={roomId} className="flex items-start gap-2 bg-secondary/30 border border-border rounded-md px-3 py-2">
                      <BedDouble className="size-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono font-semibold text-foreground">{r.room_number}</span>
                          <span className="text-xs text-muted-foreground">{r.hotel} · {r.room_type}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {stays.map((s) => s.guest!.full_name).join(', ')}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </Section>
      </DialogContent>
    </Dialog>
  )
}

function SummaryChip({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  const palette: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  }
  return (
    <div className={`rounded-md border px-3 py-2 ${palette[color]}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  )
}

function Section({ title, emptyMessage, children }: { title: string; emptyMessage: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.flat() : [children]
  const hasContent = items.some((x) => x !== null && x !== undefined && x !== false)
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      {hasContent ? (
        <div className="space-y-1">{children}</div>
      ) : (
        <div className="text-xs text-muted-foreground italic">{emptyMessage}</div>
      )}
    </div>
  )
}

function PersonRow({ name, sub, room }: { name: string; sub: string; room: string }) {
  return (
    <div className="flex items-center justify-between bg-secondary/30 border border-border rounded-md px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{name}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </div>
      <div className="text-xs font-mono text-blue-400 ml-3">{room}</div>
    </div>
  )
}
