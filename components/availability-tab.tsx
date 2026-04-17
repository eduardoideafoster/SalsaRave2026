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

  // Calculate availability by date — only guest rooms count; staff rooms
  // are held for staff and never shown as "available" to guests.
  const guestRooms = useMemo(() => rooms.filter((r) => !r.is_staff), [rooms])

  const availabilityByDate = useMemo((): AvailabilityByDate[] => {
    return days.map((date) => {
      const h3RoomsAvailable = guestRooms.filter(r =>
        r.hotel === 'H3' &&
        !isAfter(parseISO(r.available_from), date)
      )
      const h4RoomsAvailable = guestRooms.filter(r =>
        r.hotel === 'H4' &&
        !isAfter(parseISO(r.available_from), date)
      )

      // Rooms booked on this date
      const bookedRoomIds = bookings
        .filter(b => {
          if (b.status === 'cancelled') return false
          const checkIn = parseISO(b.check_in_date)
          const checkOut = parseISO(b.check_out_date)
          return !isBefore(date, checkIn) && isBefore(date, checkOut)
        })
        .map(b => b.room_id)

      const h3Free = h3RoomsAvailable.filter(r => !bookedRoomIds.includes(r.id)).length
      const h4Free = h4RoomsAvailable.filter(r => !bookedRoomIds.includes(r.id)).length

      return {
        date,
        h3Available: h3Free,
        h4Available: h4Free,
        h3Total: h3RoomsAvailable.length,
        h4Total: h4RoomsAvailable.length,
      }
    })
  }, [days, guestRooms, bookings])

  // Stacked bar data: per day, split rooms into 4 layers
  //   - staff (is_staff rooms whose available_from <= date)
  //   - 4-night bookings (check_in = Sep 10)
  //   - 3-night bookings (check_in = Sep 11)
  //   - free (total rooms - all the above)
  // hotelFilter narrows to H3 or H4.
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
        return !isBefore(date, ci) && isBefore(date, co)
      })
      // Distinct room_ids booked this day (hotel-filtered)
      const bookedRoomIds = new Set<string>()
      const fourNightRoomIds = new Set<string>()
      const threeNightRoomIds = new Set<string>()
      for (const b of activeOnDate) {
        const room = filteredGuestRooms.find((r) => r.id === b.room_id)
        if (!room) continue
        bookedRoomIds.add(room.id)
        const ci = parseISO(b.check_in_date)
        if (ci.getUTCDate() === 10) fourNightRoomIds.add(room.id)
        else if (ci.getUTCDate() === 11) threeNightRoomIds.add(room.id)
      }
      const nights4 = fourNightRoomIds.size
      const nights3 = threeNightRoomIds.size
      // Some rooms might be booked but not attributed to 3/4 (edge cases from manual edits)
      const booked = bookedRoomIds.size
      const otherBooked = Math.max(0, booked - nights4 - nights3)

      const total = filteredRooms.length
      const free = total - staff - booked

      return {
        date,
        label: format(date, 'EEE d'),
        Staff: staff,
        'Guests 4-night': nights4,
        'Guests 3-night': nights3,
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
      return !isBefore(date, checkIn) && isBefore(date, checkOut)
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
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            Event: {format(EVENT_START, 'EEEE, MMMM d')} - {format(EVENT_END, 'EEEE, MMMM d, yyyy')}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Select value={hotelFilter} onValueChange={(v) => setHotelFilter(v as typeof hotelFilter)}>
            <SelectTrigger className="w-40 bg-card border-border">
              <SelectValue placeholder="Filter by hotel" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Hotels</SelectItem>
              <SelectItem value="H3">H3 (Standard)</SelectItem>
              <SelectItem value="H4">H4 (Upgraded)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Room Inventory Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="font-semibold text-foreground mb-3">
            H3 — Standard Hotel ({guestRooms.filter(r => r.hotel === 'H3').length} guest rooms
            {rooms.filter(r => r.hotel === 'H3' && r.is_staff).length > 0 && (
              <span className="text-muted-foreground font-normal"> · {rooms.filter(r => r.hotel === 'H3' && r.is_staff).length} reserved for staff</span>
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
              <span className="text-muted-foreground font-normal"> · {rooms.filter(r => r.hotel === 'H4' && r.is_staff).length} reserved for staff</span>
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
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">
            Room occupancy per day {hotelFilter !== 'all' && `(${hotelFilter} only)`}
          </h3>
          <span className="text-xs text-muted-foreground">Click a day in the table below for check-in / check-out details</span>
        </div>
        <div className="h-72 w-full">
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
              <Bar dataKey="Staff" stackId="a" fill="#a78bfa" />
              <Bar dataKey="Guests 4-night" stackId="a" fill="#116dff" />
              <Bar dataKey="Guests 3-night" stackId="a" fill="#60a5fa" />
              <Bar dataKey="Other" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Free" stackId="a" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Availability Overview */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="font-semibold text-foreground mb-4">
          Daily Availability Overview <span className="text-xs text-muted-foreground font-normal">· click a row for details</span>
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
      <div className="flex items-center gap-6 text-xs">
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
