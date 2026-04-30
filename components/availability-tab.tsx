'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Room, Booking, Guest } from '@/lib/types'
import { format, eachDayOfInterval, parseISO, isAfter, isBefore, isSameDay } from 'date-fns'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { DayDetailDialog } from '@/components/day-detail-dialog'
import { useT } from '@/lib/i18n'

// Event date range: September 7-15, 2026
const EVENT_START = new Date(2026, 8, 7) // Sep 7, 2026
const EVENT_END = new Date(2026, 8, 15) // Sep 15, 2026

interface BookingWithDetails extends Booking {
  guest: Guest
  room: Room
}

interface AvailabilityByDate {
  date: Date
  h3Available: number
  h4Available: number
  h3Total: number
  h4Total: number
}

export function AvailabilityTab() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<BookingWithDetails[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [hotelFilter, setHotelFilter] = useState<'all' | 'H3' | 'H4'>('all')
  const [drilldownDate, setDrilldownDate] = useState<Date | null>(null)

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    const [roomsRes, bookingsRes, guestsRes] = await Promise.all([
      supabase.from('rooms').select('*').order('hotel').order('room_number'),
      supabase.from('bookings').select('*, guest:guests(*), room:rooms(*)'),
      supabase.from('guests').select('*'),
    ])

    if (roomsRes.data) setRooms(roomsRes.data)
    if (bookingsRes.data) setBookings(bookingsRes.data as BookingWithDetails[])
    if (guestsRes.data) setGuests(guestsRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const days = useMemo(() => {
    return eachDayOfInterval({ start: EVENT_START, end: EVENT_END })
  }, [])

  // Calculate availability by date.
  // Denominator = ALL rooms of each hotel (staff + guest).
  // Numerator   = rooms not currently occupied (either by staff or guests).
  const guestRooms = useMemo(() => rooms.filter((r) => !r.is_staff), [rooms])

  // A room counts as part of "real inventory" on a given date when:
  //   - its available_from has kicked in (we control the room from that night)
  //   - its status is not 'maintenance' (the hotel may keep some rooms aside)
  const isInInventory = (r: Room, date: Date) =>
    r.status !== 'maintenance' && r.status !== 'blocked' && !isAfter(parseISO(r.available_from), date)

  const availabilityByDate = useMemo((): AvailabilityByDate[] => {
    return days.map((date) => {
      const h3Total = rooms.filter((r) => r.hotel === 'H3' && isInInventory(r, date)).length
      const h4Total = rooms.filter((r) => r.hotel === 'H4' && isInInventory(r, date)).length

      // Staff rooms "occupied" on this day (their available_from has kicked in)
      const staffOccupiedH3 = rooms.filter(
        (r) => r.hotel === 'H3' && r.is_staff && !isAfter(parseISO(r.available_from), date),
      ).length
      const staffOccupiedH4 = rooms.filter(
        (r) => r.hotel === 'H4' && r.is_staff && !isAfter(parseISO(r.available_from), date),
      ).length

      // Guest-booked rooms on this day (hotel-scoped)
      const bookedGuestRoomIds = new Set(
        bookings
          .filter((b) => {
            if (b.status === 'cancelled') return false
            const ci = parseISO(b.check_in_date)
            const co = parseISO(b.check_out_date)
            return !isBefore(date, ci) && !isAfter(date, co)
          })
          .map((b) => b.room_id),
      )
      const h3Booked = guestRooms.filter((r) => r.hotel === 'H3' && bookedGuestRoomIds.has(r.id)).length
      const h4Booked = guestRooms.filter((r) => r.hotel === 'H4' && bookedGuestRoomIds.has(r.id)).length

      return {
        date,
        h3Available: h3Total - staffOccupiedH3 - h3Booked,
        h4Available: h4Total - staffOccupiedH4 - h4Booked,
        h3Total,
        h4Total,
      }
    })
  }, [days, rooms, guestRooms, bookings])

  // Stacked bar data: per day, split rooms into 4 layers
  //   - staff (is_staff rooms whose available_from <= date)
  //   - 4-night bookings (check_in = '2026-09-10')
  //   - 3-night bookings (check_in = '2026-09-11')
  //   - free (total rooms - all the above)
  // hotelFilter narrows to H3 or H4. String comparison on check_in_date
  // avoids any UTC/local date drift.
  const stackedData = useMemo(() => {
    const filterHotel = (r: Room) => hotelFilter === 'all' || r.hotel === hotelFilter
    const filteredRooms = rooms.filter(filterHotel)
    const filteredGuestRooms = guestRooms.filter(filterHotel)

    return days.map((date) => {
      const staff = filteredRooms.filter(
        (r) => r.is_staff && !isAfter(parseISO(r.available_from), date),
      ).length

      const activeOnDate = bookings.filter((b) => {
        if (b.status === 'cancelled') return false
        const ci = parseISO(b.check_in_date)
        const co = parseISO(b.check_out_date)
        return !isBefore(date, ci) && !isAfter(date, co)
      })
      const bookedRoomIds = new Set<string>()
      const fourNightRoomIds = new Set<string>()
      const threeNightRoomIds = new Set<string>()
      for (const b of activeOnDate) {
        const room = filteredGuestRooms.find((r) => r.id === b.room_id)
        if (!room) continue
        bookedRoomIds.add(room.id)
        if (b.check_in_date === '2026-09-10') fourNightRoomIds.add(room.id)
        else if (b.check_in_date === '2026-09-11') threeNightRoomIds.add(room.id)
      }
      const nights4 = fourNightRoomIds.size
      const nights3 = threeNightRoomIds.size
      const booked = bookedRoomIds.size
      const otherBooked = Math.max(0, booked - nights4 - nights3)

      const total = filteredRooms.filter((r) => isInInventory(r, date)).length
      const free = Math.max(0, total - staff - booked)

      return {
        date,
        label: format(date, 'EEE d'),
        'Core Tribe': staff,
        'SalsaRavers 4 Nights': nights4,
        'SalsaRavers 3 Nights': nights3,
        Other: otherBooked,
        Free: free,
      }
    })
  }, [days, rooms, guestRooms, bookings, hotelFilter])

  // Room type breakdown (guest rooms only)
  const h3Breakdown = useMemo(() => {
    const h3 = guestRooms.filter(r => r.hotel === 'H3')
    return {
      double: h3.filter(r => r.room_type === 'double').length,
      triple: h3.filter(r => r.room_type === 'triple').length,
      quadruple: h3.filter(r => r.room_type === 'quadruple').length,
    }
  }, [guestRooms])

  const isRoomAvailableOnDate = (room: Room, date: Date): boolean => {
    return !isAfter(parseISO(room.available_from), date)
  }

  const isRoomBookedOnDate = (room: Room, date: Date): boolean => {
    return bookings.some(b => {
      if (b.room_id !== room.id || b.status === 'cancelled') return false
      const checkIn = parseISO(b.check_in_date)
      const checkOut = parseISO(b.check_out_date)
      return !isBefore(date, checkIn) && !isAfter(date, checkOut)
    })
  }

  const filteredRooms = guestRooms.filter(r => hotelFilter === 'all' || r.hotel === hotelFilter)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            <span className="hidden sm:inline">Event: </span>
            {format(EVENT_START, 'MMM d')} – {format(EVENT_END, 'MMM d, yyyy')}
          </span>
        </div>
        <Select value={hotelFilter} onValueChange={(v) => setHotelFilter(v as typeof hotelFilter)}>
          <SelectTrigger className="w-full sm:w-40 bg-card border-border">
            <SelectValue placeholder="Filter by hotel" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Hotels</SelectItem>
            <SelectItem value="H3">H3 (Standard)</SelectItem>
            <SelectItem value="H4">H4 (Upgraded)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Room Inventory Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="font-semibold text-foreground mb-3">
            H3 — Standard Hotel ({guestRooms.filter(r => r.hotel === 'H3').length} guest rooms
            {rooms.filter(r => r.hotel === 'H3' && r.is_staff).length > 0 && (
              <span className="text-muted-foreground font-normal"> · {rooms.filter(r => r.hotel === 'H3' && r.is_staff).length} reserved for Core Tribe</span>
            )})
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Double:</span>
              <span className="text-foreground">{h3Breakdown.double}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Triple:</span>
              <span className="text-foreground">{h3Breakdown.triple}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quadruple:</span>
              <span className="text-foreground">{h3Breakdown.quadruple}</span>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="font-semibold text-foreground mb-3">
            H4 — Upgraded Hotel ({guestRooms.filter(r => r.hotel === 'H4').length} guest rooms
            {rooms.filter(r => r.hotel === 'H4' && r.is_staff).length > 0 && (
              <span className="text-muted-foreground font-normal"> · {rooms.filter(r => r.hotel === 'H4' && r.is_staff).length} reserved for Core Tribe</span>
            )})
          </h3>
          <div className="text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Double (can be single):</span>
              <span className="text-foreground">{guestRooms.filter(r => r.hotel === 'H4').length}</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            All rooms are double rooms that can be used as single
          </div>
        </div>
      </div>

      {/* Room occupancy per day — stacked bar */}
      <div className="bg-card rounded-lg border border-border p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
          <h3 className="font-semibold text-foreground text-sm sm:text-base">
            Room occupancy per day {hotelFilter !== 'all' && `(${hotelFilter} only)`}
          </h3>
          <span className="text-xs text-muted-foreground">Tap a day in the table below for details</span>
        </div>
        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stackedData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              onClick={(e) => {
                if (e && e.activePayload?.[0]?.payload?.date) {
                  setDrilldownDate(e.activePayload[0].payload.date)
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--foreground)',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
              />
              <Legend />
              <Bar dataKey="Core Tribe" stackId="a" fill="#a78bfa" />
              <Bar dataKey="SalsaRavers 4 Nights" stackId="a" fill="#116dff" />
              <Bar dataKey="SalsaRavers 3 Nights" stackId="a" fill="#60a5fa" />
              <Bar dataKey="Other" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Free" stackId="a" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Availability Overview */}
      <div className="bg-card rounded-lg border border-border p-3 sm:p-4">
        <h3 className="font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">
          Daily Availability Overview <span className="text-xs text-muted-foreground font-normal block sm:inline">· tap a row for details</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">H3 Available</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">H4 Available</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Total Free</th>
              </tr>
            </thead>
            <tbody>
              {availabilityByDate.map(({ date, h3Available, h4Available, h3Total, h4Total }) => (
                <tr
                  key={date.toISOString()}
                  className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer"
                  onClick={() => setDrilldownDate(date)}
                >
                  <td className="px-3 py-2 text-sm">
                    <span className="font-medium text-foreground hover:text-primary">{format(date, 'EEE, MMM d')}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-sm font-medium ${h3Available > 50 ? 'text-emerald-400' : h3Available > 20 ? 'text-amber-400' : 'text-red-400'}`}>
                      {h3Available}
                    </span>
                    <span className="text-xs text-muted-foreground"> / {h3Total}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-sm font-medium ${h4Available > 20 ? 'text-emerald-400' : h4Available > 10 ? 'text-amber-400' : 'text-red-400'}`}>
                      {h4Available}
                    </span>
                    <span className="text-xs text-muted-foreground"> / {h4Total}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-sm font-bold text-primary">{h3Available + h4Available}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 sm:gap-6 text-xs flex-wrap">
        <div className="flex items-center gap-2">
          <div className="size-3 rounded bg-emerald-500" />
          <span className="text-muted-foreground">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-3 rounded bg-blue-500" />
          <span className="text-muted-foreground">Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-3 rounded bg-slate-700" />
          <span className="text-muted-foreground">Not Yet Available</span>
        </div>
      </div>

      {/* Room Grid */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead className="bg-secondary">
              <tr>
                <th className="sticky left-0 z-10 bg-secondary px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-36 border-r border-border">
                  Room
                </th>
                {days.map((day) => (
                  <th
                    key={day.toISOString()}
                    className={`px-2 py-3 text-center text-xs font-medium min-w-14 ${
                      isSameDay(day, new Date())
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <div>{format(day, 'EEE')}</div>
                    <div className="font-semibold">{format(day, 'd')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRooms.slice(0, 50).map((room) => (
                <tr key={room.id} className="bg-card">
                  <td className="sticky left-0 z-10 bg-card px-4 py-2 border-r border-border">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{room.room_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {room.hotel} — {room.room_type === 'triple' ? 'Triple' :
                          room.room_type === 'quadruple' ? 'Quad' :
                          room.room_type === 'single' ? 'Single' : 'Double'}
                      </span>
                    </div>
                  </td>
                  {days.map((day) => {
                    const isAvailable = isRoomAvailableOnDate(room, day)
                    const isBooked = isRoomBookedOnDate(room, day)
                    const isToday = isSameDay(day, new Date())
                    
                    return (
                      <td
                        key={day.toISOString()}
                        className={`p-1 ${isToday ? 'bg-primary/5' : ''}`}
                      >
                        <div 
                          className={`h-8 rounded-sm ${
                            !isAvailable 
                              ? 'bg-slate-700/50' 
                              : isBooked 
                                ? 'bg-blue-500' 
                                : 'bg-emerald-500/30'
                          }`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredRooms.length > 50 && (
          <div className="px-4 py-3 text-sm text-muted-foreground bg-secondary border-t border-border">
            Showing first 50 rooms of {filteredRooms.length} total
          </div>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        Guest rooms: {guestRooms.length} (H3: {guestRooms.filter(r => r.hotel === 'H3').length}, H4: {guestRooms.filter(r => r.hotel === 'H4').length}) · Staff-reserved: {rooms.length - guestRooms.length}
      </div>

      <DayDetailDialog
        date={drilldownDate}
        rooms={rooms}
        guests={guests}
        bookings={bookings}
        open={drilldownDate !== null}
        onOpenChange={(open) => !open && setDrilldownDate(null)}
      />
    </div>
  )
}
