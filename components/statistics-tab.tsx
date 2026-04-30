'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Guest, Room, Booking } from '@/lib/types'
import { Spinner } from '@/components/ui/spinner'
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
    
    const guestsInSharedRooms = guests.length - singleRooms

    // Room occupancy: a room is "booked" if any active booking points at it.
    const bookedRoomIds = new Set(
      bookings.filter((b) => b.status !== 'cancelled').map((b) => b.room_id),
    )
    // Effective inventory excludes maintenance rooms (e.g. hotel-reserved blocks).
    const guestRooms = rooms.filter((r) => !r.is_staff && r.status !== 'maintenance')
    const staffRooms = rooms.filter((r) => r.is_staff)
    const guestRoomsBooked = guestRooms.filter((r) => bookedRoomIds.has(r.id)).length
    const guestRoomsRemaining = guestRooms.length - guestRoomsBooked
    const h3Guest = guestRooms.filter((r) => r.hotel === 'H3')
    const h4Guest = guestRooms.filter((r) => r.hotel === 'H4')
    const h3Booked = h3Guest.filter((r) => bookedRoomIds.has(r.id)).length
    const h4Booked = h4Guest.filter((r) => bookedRoomIds.has(r.id)).length

    return {
      total,
      leaders,
      followers,
      both,
      countries,
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
      guestsInSharedRooms,
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
    }
  }, [guests, rooms, bookings])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Rooms Remaining — global + per-hotel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 rounded-xl border border-emerald-500/40 p-4 sm:p-6">
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
        <div className="bg-gradient-to-br from-slate-500/15 to-slate-500/5 rounded-xl border border-slate-500/40 p-4 sm:p-6">
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
        <div className="bg-gradient-to-br from-amber-500/20 to-amber-500/5 rounded-xl border border-amber-500/40 p-4 sm:p-6">
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

      {/* Room Sharing Stats */}
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Room Sharing Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-6">
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-foreground">{stats.uniqueOrders}</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Total Orders</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-blue-400">{stats.singleRooms}</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Single Bookings</p>
            <p className="text-xs text-muted-foreground hidden sm:block">(1 person/order)</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-cyan-400">{stats.doubleRooms}</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Double Bookings</p>
            <p className="text-xs text-muted-foreground hidden sm:block">(2 people/order)</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-4xl font-bold text-emerald-400">{stats.tripleRooms}</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Triple Bookings</p>
            <p className="text-xs text-muted-foreground hidden sm:block">(3+ people/order)</p>
          </div>
          <div className="text-center col-span-2 md:col-span-1">
            <p className="text-2xl sm:text-4xl font-bold text-primary">{stats.guestsInSharedRooms}</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Sharing Rooms</p>
            <p className="text-xs text-muted-foreground hidden sm:block">(guests in shared)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
