'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Guest, Room, Booking } from '@/lib/types'
import { Spinner } from '@/components/ui/spinner'
import { WorldPresenceMap } from '@/components/world-presence-map'
import { Users, MapPin, Ticket, Calendar, BedDouble, Music } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  color: string
}

function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1.5 sm:mt-2">{value}</p>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>}
        </div>
        <div className={`p-2 sm:p-3 rounded-lg shrink-0 ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

interface DistributionBarProps {
  label: string
  count: number
  total: number
  color: string
}

function DistributionBar({ label, count, total, color }: DistributionBarProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground font-medium">{label}</span>
        <span className="text-muted-foreground">{count} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}


/**
 * A number that tweens from zero. The digits come from a CSS counter
 * driven by a registered integer property, so the browser interpolates
 * it; the real value stays in the DOM for screen readers.
 */
function CountUp({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className}>
      <span className="count-up" aria-hidden style={{ '--count-to': value } as React.CSSProperties} />
      <span className="sr-only">{value}</span>
    </span>
  )
}

export function StatisticsTab() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const fetchAll = useCallback(async () => {
    const [g, r, b] = await Promise.all([
      supabase.from('guests').select('*'),
      supabase.from('rooms').select('*'),
      supabase.from('bookings').select('*'),
    ])
    if (g.data) setGuests(g.data)
    if (r.data) setRooms(r.data)
    if (b.data) setBookings(b.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const stats = useMemo(() => {
    const total = guests.length
    const leaders = guests.filter(g => g.role === 'Leader').length
    const followers = guests.filter(g => g.role === 'Follower').length
    const both = guests.filter(g => g.role === 'Both').length

    // Country distribution
    const countryMap = new Map<string, number>()
    guests.forEach(g => {
      const country = g.country || 'Unknown'
      countryMap.set(country, (countryMap.get(country) || 0) + 1)
    })
    const countries = Array.from(countryMap.entries())
      .sort((a, b) => b[1] - a[1])

    // Same population as `countries`, split by role for the map's tooltip.
    const presenceMap = new Map<string, { country: string; total: number; leaders: number; followers: number }>()
    guests.forEach(g => {
      const country = g.country || 'Unknown'
      const row = presenceMap.get(country) ?? { country, total: 0, leaders: 0, followers: 0 }
      row.total++
      if (g.role === 'Leader') row.leaders++
      else if (g.role === 'Follower') row.followers++
      presenceMap.set(country, row)
    })
    const countryPresence = Array.from(presenceMap.values()).sort((a, b) => b.total - a.total)

    // Ticket type distribution
    const ticketMap = new Map<string, number>()
    guests.forEach(g => {
      ticketMap.set(g.ticket_type, (ticketMap.get(g.ticket_type) || 0) + 1)
    })
    const tickets = Array.from(ticketMap.entries())
      .sort((a, b) => b[1] - a[1])

    // Accommodation stats
    const withRoom = guests.filter(g => g.check_in_date !== null).length
    const ravepassOnly = guests.filter(g => g.ticket_type === 'RAVEPASS').length
    const fourNights = guests.filter(g => g.ticket_type.includes('4 NIGHTS')).length
    const threeNights = guests.filter(g => g.ticket_type.includes('3 NIGHTS')).length

    // Hotel breakdown
    const h3Guests = guests.filter(g => (g as any).hotel === 'H3' && g.check_in_date !== null).length
    const h4Guests = guests.filter(g => (g as any).hotel === 'H4').length

    // Room sharing analysis
    const orderCounts = new Map<string, number>()
    guests.forEach(g => {
      orderCounts.set(g.order_code, (orderCounts.get(g.order_code) || 0) + 1)
    })
    
    const uniqueOrders = orderCounts.size
    let singleRooms = 0
    let doubleRooms = 0
    let tripleRooms = 0
    
    orderCounts.forEach((count) => {
      if (count === 1) singleRooms++
      else if (count === 2) doubleRooms++
      else if (count >= 3) tripleRooms++
    })
    
    // Guests inside orders of two or more. The old line subtracted a
    // count of orders from a count of guests — it happened to land on
    // the right number, but it was mixing units.
    let guestsInMultiPersonOrders = 0
    orderCounts.forEach((count) => {
      if (count >= 2) guestsInMultiPersonOrders += count
    })

    // What the room panel actually promised: occupancy of real rooms,
    // which is a different population — 284 guests hold no room at all.
    const occupancy = new Map<string, number>()
    for (const b of bookings) {
      if (b.status === 'cancelled') continue
      occupancy.set(b.room_id, (occupancy.get(b.room_id) ?? 0) + 1)
    }
    let rooms1 = 0, rooms2 = 0, rooms3plus = 0, guestsSharing = 0, guestsWithRoom = 0
    occupancy.forEach((n) => {
      guestsWithRoom += n
      if (n === 1) rooms1 += 1
      else {
        if (n === 2) rooms2 += 1
        else rooms3plus += 1
        guestsSharing += n
      }
    })
    const roomsInUse = occupancy.size
    const guestsWithoutRoom = guests.length - guestsWithRoom

    // Room occupancy: a room is "booked" if any active booking points at it.
    const bookedRoomIds = new Set(
      bookings.filter((b) => b.status !== 'cancelled').map((b) => b.room_id),
    )
    // Effective inventory excludes maintenance rooms (e.g. hotel-reserved blocks).
    const guestRooms = rooms.filter((r) => !r.is_staff && r.status !== 'maintenance' && r.status !== 'blocked')
    const staffRooms = rooms.filter((r) => r.is_staff)
    const guestRoomsBooked = guestRooms.filter((r) => bookedRoomIds.has(r.id)).length
    const guestRoomsRemaining = guestRooms.length - guestRoomsBooked
    const h3Guest = guestRooms.filter((r) => r.hotel === 'H3')
    const h4Guest = guestRooms.filter((r) => r.hotel === 'H4')
    const h3Booked = h3Guest.filter((r) => bookedRoomIds.has(r.id)).length
    const h4Booked = h4Guest.filter((r) => bookedRoomIds.has(r.id)).length

    // Inventory comes from the rooms themselves. It used to be hard-coded
    // at 160 for Thursday and 270 for Friday, which went stale the moment
    // the ten blocked rooms were released: it then read 271 rooms in use
    // against a ceiling of 270 and reported one room oversold, while the
    // panel below correctly showed nine still to sell.
    const inventoryOn = (date: string) =>
      rooms.filter(
        (r) =>
          !r.is_staff &&
          r.status !== 'maintenance' &&
          r.status !== 'blocked' &&
          r.available_from <= date,
      ).length
    const inventoryThu = inventoryOn('2026-09-10')
    const inventoryFri = inventoryOn('2026-09-11')
    // Distinct rooms in use on each night
    // Checkout date is inclusive (the room is still considered occupied on the day a guest leaves).
    const guestRoomIds = new Set(guestRooms.map((r) => r.id))
    const guestRoomsInUseOn = (date: string) =>
      new Set(
        bookings
          .filter(
            (b) =>
              b.status !== 'cancelled' &&
              b.check_in_date <= date &&
              b.check_out_date >= date &&
              guestRoomIds.has(b.room_id),
          )
          .map((b) => b.room_id),
      ).size
    const roomsOnSep10 = guestRoomsInUseOn('2026-09-10')
    const roomsOnSep11 = guestRoomsInUseOn('2026-09-11')
    // Sellable means free for the WHOLE stay, not just the first night.
    // Counting rooms idle on Thursday claimed 28 were sellable as
    // 4-night stays, but every one of them is taken from Friday by
    // someone arriving then: none can actually be sold Thu to Mon.
    const sellableForStay = (checkIn: string, lastNight: string) =>
      rooms.filter(
        (r) =>
          // Staff rooms are not for sale. Leaving them in made this panel
          // disagree with Total remaining below, which has always counted
          // guest rooms only: one of the six was H3-435, a staff room.
          !r.is_staff &&
          r.status !== 'maintenance' &&
          r.status !== 'blocked' &&
          r.available_from <= checkIn &&
          !bookings.some(
            (b) =>
              b.status !== 'cancelled' &&
              b.room_id === r.id &&
              b.check_in_date <= lastNight &&
              b.check_out_date >= checkIn,
          ),
      ).length

    // Nights, not dates: a Thursday check-in occupies Thu, Fri, Sat, Sun.
    const fourNightFree = sellableForStay('2026-09-10', '2026-09-13')
    const threeNightFree = sellableForStay('2026-09-11', '2026-09-13')

    return {
      total,
      leaders,
      followers,
      both,
      countries,
      countryPresence,
      tickets,
      withRoom,
      ravepassOnly,
      fourNights,
      threeNights,
      h3Guests,
      h4Guests,
      uniqueOrders,
      singleRooms,
      doubleRooms,
      tripleRooms,
      guestsInMultiPersonOrders,
      roomsInUse,
      rooms1,
      rooms2,
      rooms3plus,
      guestsSharing,
      guestsWithoutRoom,
      guestRoomsTotal: guestRooms.length,
      guestRoomsBooked,
      guestRoomsRemaining,
      staffRoomsTotal: staffRooms.length,
      h3GuestTotal: h3Guest.length,
      h3Booked,
      h3Remaining: h3Guest.length - h3Booked,
      h4GuestTotal: h4Guest.length,
      h4Booked,
      h4Remaining: h4Guest.length - h4Booked,
      inventoryThu,
      inventoryFri,
      roomsOnSep10,
      roomsOnSep11,
      fourNightFree,
      threeNightFree,
    }
  }, [guests, rooms, bookings])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-primary" />
      </div>
    )
  }

  // Helpers for the per-night sales-capacity cards
  const fmtDelta = (n: number) =>
    n > 0 ? `${n} free for the whole stay` : 'none left'
  const deltaColor = (n: number) =>
    n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-muted-foreground'
  const cardTone = (n: number) =>
    n < 0
      ? 'from-red-500/20 to-red-500/5 border-red-500/40'
      : n === 0
      ? 'from-amber-500/20 to-amber-500/5 border-amber-500/40'
      : 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/40'
  const numberTone = (n: number) =>
    n < 0 ? 'text-red-400' : n === 0 ? 'text-amber-400' : 'text-emerald-400'
  // Colour of the travelling highlight on each card's border.
  const spinColor = (n: number) =>
    n < 0 ? '#f87171' : n === 0 ? '#fbbf24' : '#34d399'

  // How the inventory breaks down by bed layout.
  const typeCounts = rooms.reduce<Record<string, number>>((acc, r) => {
    acc[r.room_type] = (acc[r.room_type] ?? 0) + 1
    return acc
  }, {})
  const typeCards: { key: string; label: string; tone: string }[] = [
    { key: 'single', label: 'Single', tone: 'text-sky-300' },
    { key: 'twin', label: 'Twin', tone: 'text-teal-300' },
    { key: 'matrimonial', label: 'Matrimonial', tone: 'text-fuchsia-300' },
    { key: 'triple', label: 'Triple', tone: 'text-amber-300' },
    { key: 'quadruple', label: 'Quadruple', tone: 'text-rose-300' },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sellable rooms per check-in window — what can still go on sale */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div
          className={`spin-border bg-gradient-to-br ${cardTone(stats.fourNightFree)} rounded-xl border p-4 sm:p-6`}
          style={{ '--spin-color': spinColor(stats.fourNightFree) } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 mb-2">
            <BedDouble className="size-5 text-foreground/80" />
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-foreground/90">
              4-Night sellable (check-in Thu)
            </span>
          </div>
          <div className={`text-5xl sm:text-7xl font-black leading-none ${numberTone(stats.fourNightFree)}`}>
            {stats.fourNightFree}
          </div>
          <div className="mt-3 text-xs sm:text-sm text-muted-foreground">
            <span className={`font-semibold ${deltaColor(stats.fourNightFree)}`}>
              {fmtDelta(stats.fourNightFree)}
            </span>
            {' · '}
            {stats.roomsOnSep10}/{stats.inventoryThu} guest rooms in use Thu night
          </div>
        </div>
        <div
          className={`spin-border bg-gradient-to-br ${cardTone(stats.threeNightFree)} rounded-xl border p-4 sm:p-6`}
          style={{ '--spin-color': spinColor(stats.threeNightFree) } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 mb-2">
            <BedDouble className="size-5 text-foreground/80" />
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-foreground/90">
              3-Night sellable (check-in Fri)
            </span>
          </div>
          <div className={`text-5xl sm:text-7xl font-black leading-none ${numberTone(stats.threeNightFree)}`}>
            {stats.threeNightFree}
          </div>
          <div className="mt-3 text-xs sm:text-sm text-muted-foreground">
            <span className={`font-semibold ${deltaColor(stats.threeNightFree)}`}>
              {fmtDelta(stats.threeNightFree)}
            </span>
            {' · '}
            {stats.roomsOnSep11}/{stats.inventoryFri} guest rooms in use Fri night
          </div>
        </div>
      </div>

      {/* Rooms Remaining — global + per-hotel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div
          className="spin-border bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 rounded-xl border border-emerald-500/40 p-4 sm:p-6"
          style={{ '--spin-color': '#34d399' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <BedDouble className="size-5" />
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider">Total Remaining</span>
          </div>
          <div className="text-5xl sm:text-7xl font-black text-emerald-400 leading-none">
            {stats.guestRoomsRemaining}
          </div>
          <div className="mt-3 text-xs sm:text-sm text-muted-foreground">
            of <span className="text-foreground font-semibold">{stats.guestRoomsTotal}</span> guest rooms · {stats.guestRoomsBooked} booked
          </div>
        </div>
        <div
          className="spin-border bg-gradient-to-br from-slate-500/15 to-slate-500/5 rounded-xl border border-slate-500/40 p-4 sm:p-6"
          style={{ '--spin-color': '#cbd5e1' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 text-slate-300 mb-2">
            <BedDouble className="size-5" />
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider">H3 — Standard</span>
          </div>
          <div className="text-5xl sm:text-7xl font-black text-slate-200 leading-none">
            {stats.h3Remaining}
          </div>
          <div className="mt-3 text-xs sm:text-sm text-muted-foreground">
            of <span className="text-foreground font-semibold">{stats.h3GuestTotal}</span> · {stats.h3Booked} booked
          </div>
        </div>
        <div
          className="spin-border bg-gradient-to-br from-amber-500/20 to-amber-500/5 rounded-xl border border-amber-500/40 p-4 sm:p-6"
          style={{ '--spin-color': '#fbbf24' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 text-amber-400 mb-2">
            <BedDouble className="size-5" />
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider">H4 — Upgraded</span>
          </div>
          <div className="text-5xl sm:text-7xl font-black text-amber-400 leading-none">
            {stats.h4Remaining}
          </div>
          <div className="mt-3 text-xs sm:text-sm text-muted-foreground">
            of <span className="text-foreground font-semibold">{stats.h4GuestTotal}</span> · {stats.h4Booked} booked
          </div>
        </div>
      </div>

      {/* Rooms by bed layout */}
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Rooms by type</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-6">
          {typeCards.map((c) => (
            <div key={c.key} className="text-center">
              <p className={`text-2xl sm:text-4xl font-bold ${c.tone}`}>
                <CountUp value={typeCounts[c.key] ?? 0} />
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Real room occupancy — one row per actual room */}
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1">Room occupancy</h3>
        <p className="text-xs text-muted-foreground mb-3 sm:mb-4">
          Counted over rooms actually assigned, not over orders.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-6">
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-foreground"><CountUp value={stats.roomsInUse} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Rooms in use</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-sky-300"><CountUp value={stats.rooms1} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">With 1 guest</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-teal-300"><CountUp value={stats.rooms2} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">With 2 guests</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-amber-300"><CountUp value={stats.rooms3plus} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">With 3+ guests</p>
          </div>
          <div className="text-center col-span-2 md:col-span-1">
            <p className="text-2xl sm:text-4xl font-bold text-primary"><CountUp value={stats.guestsSharing} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Guests sharing</p>
            <p className="text-xs text-muted-foreground hidden sm:block">(in rooms of 2+)</p>
          </div>
        </div>
      </div>

      {/* Orders by size — a different population: every guest, room or not */}
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1">Orders by size</h3>
        <p className="text-xs text-muted-foreground mb-3 sm:mb-4">
          How many people each order covers. Counts every guest, including the{' '}
          <span className="text-foreground font-semibold">{stats.guestsWithoutRoom}</span> with no room assigned.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-6">
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-foreground"><CountUp value={stats.uniqueOrders} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Total orders</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-blue-400"><CountUp value={stats.singleRooms} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Orders of 1</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-cyan-400"><CountUp value={stats.doubleRooms} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Orders of 2</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-emerald-400"><CountUp value={stats.tripleRooms} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Orders of 3+</p>
          </div>
          <div className="text-center col-span-2 md:col-span-1">
            <p className="text-2xl sm:text-4xl font-bold text-primary"><CountUp value={stats.guestsInMultiPersonOrders} /></p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Guests in those</p>
            <p className="text-xs text-muted-foreground hidden sm:block">(orders of 2+)</p>
          </div>
        </div>
      </div>

      {/* Staff rooms + occupancy % (secondary) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Occupancy</p>
              <p className="text-2xl sm:text-3xl font-bold text-blue-400 mt-2">
                {(() => {
                  const total = stats.guestRoomsTotal + stats.staffRoomsTotal
                  const used = stats.guestRoomsBooked + stats.staffRoomsTotal
                  return total > 0 ? `${((used / total) * 100).toFixed(0)}%` : '—'
                })()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.guestRoomsBooked + stats.staffRoomsTotal} of {stats.guestRoomsTotal + stats.staffRoomsTotal} rooms used
              </p>
            </div>
            <div className="size-12 sm:size-14 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <BedDouble className="size-5 sm:size-6 text-blue-400" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Core Tribe Rooms</p>
              <p className="text-2xl sm:text-3xl font-bold text-amber-400 mt-2">{stats.staffRoomsTotal}</p>
              <p className="text-xs text-muted-foreground mt-1">of 30 target</p>
            </div>
            <div className="size-12 sm:size-14 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Music className="size-5 sm:size-6 text-amber-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Total Attendees"
          value={stats.total}
          subtitle={`${stats.uniqueOrders} unique orders`}
          icon={<Users className="size-5 text-white" />}
          color="bg-primary"
        />
        <StatCard
          title="Leaders"
          value={stats.leaders}
          subtitle={`${((stats.leaders / stats.total) * 100).toFixed(1)}% of total`}
          icon={<Users className="size-5 text-white" />}
          color="bg-blue-500"
        />
        <StatCard
          title="Followers"
          value={stats.followers}
          subtitle={`${((stats.followers / stats.total) * 100).toFixed(1)}% of total`}
          icon={<Users className="size-5 text-white" />}
          color="bg-pink-500"
        />
        <StatCard
          title="Countries"
          value={stats.countries.length}
          subtitle="Represented"
          icon={<MapPin className="size-5 text-white" />}
          color="bg-emerald-500"
        />
      </div>

      {/* Accommodation Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard
          title="With Accommodation"
          value={stats.withRoom}
          subtitle={`${((stats.withRoom / stats.total) * 100).toFixed(1)}% of attendees`}
          icon={<Calendar className="size-5 text-white" />}
          color="bg-indigo-500"
        />
        <StatCard
          title="RAVEPASS Only"
          value={stats.ravepassOnly}
          subtitle="No accommodation"
          icon={<Ticket className="size-5 text-white" />}
          color="bg-amber-500"
        />
        <StatCard
          title="H3 (Standard)"
          value={stats.h3Guests}
          subtitle="Standard hotel guests"
          icon={<Calendar className="size-5 text-white" />}
          color="bg-slate-500"
        />
        <StatCard
          title="H4 (Upgraded)"
          value={stats.h4Guests}
          subtitle="50 rooms available"
          icon={<Calendar className="size-5 text-white" />}
          color="bg-amber-600"
        />
        <StatCard
          title="4 Nights (Thu-Tue)"
          value={stats.fourNights}
          subtitle="Sep 10-15"
          icon={<Calendar className="size-5 text-white" />}
          color="bg-cyan-500"
        />
        <StatCard
          title="3 Nights (Fri-Tue)"
          value={stats.threeNights}
          subtitle="Sep 12-15"
          icon={<Calendar className="size-5 text-white" />}
          color="bg-violet-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        {/* Role Distribution */}
        <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Role Distribution</h3>
          <div className="space-y-4">
            <DistributionBar
              label="Leaders"
              count={stats.leaders}
              total={stats.total}
              color="bg-blue-500"
            />
            <DistributionBar
              label="Followers"
              count={stats.followers}
              total={stats.total}
              color="bg-pink-500"
            />
            {stats.both > 0 && (
              <DistributionBar
                label="Both"
                count={stats.both}
                total={stats.total}
                color="bg-purple-500"
              />
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Leader/Follower Ratio: <span className="font-medium text-foreground">
                1:{(stats.followers / stats.leaders).toFixed(2)}
              </span>
            </p>
          </div>
        </div>

        {/* Ticket Type Distribution */}
        <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Ticket Types</h3>
          <div className="space-y-4">
            {stats.tickets.map(([type, count], index) => (
              <DistributionBar
                key={type}
                label={type}
                count={count}
                total={stats.total}
                color={[
                  'bg-primary',
                  'bg-blue-500',
                  'bg-cyan-500',
                  'bg-emerald-500',
                  'bg-amber-500',
                  'bg-rose-500',
                  'bg-violet-500',
                ][index % 7]}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Country Distribution */}
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">
          Country Distribution ({stats.countries.length} countries)
        </h3>
        <div className="mb-4 sm:mb-6">
          <WorldPresenceMap data={stats.countryPresence} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
          {stats.countries.map(([country, count]) => (
            <div
              key={country}
              className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 sm:px-4 py-2 sm:py-3"
            >
              <span className="text-xs sm:text-sm font-medium text-foreground truncate">{country}</span>
              <span className="text-xs sm:text-sm text-muted-foreground ml-2 shrink-0">{count}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
