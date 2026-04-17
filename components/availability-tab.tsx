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
  const [loading, setLoading] = useState(true)
  const [hotelFilter, setHotelFilter] = useState<'all' | 'H3' | 'H4'>('all')

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    const [roomsRes, bookingsRes] = await Promise.all([
      supabase.from('rooms').select('*').order('hotel').order('room_number'),
      supabase.from('bookings').select('*, guest:guests(*), room:rooms(*)'),
    ])
    
    if (roomsRes.data) setRooms(roomsRes.data)
    if (bookingsRes.data) setBookings(bookingsRes.data as BookingWithDetails[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const days = useMemo(() => {
    return eachDayOfInterval({ start: EVENT_START, end: EVENT_END })
  }, [])

  // Calculate availability by date
  const availabilityByDate = useMemo((): AvailabilityByDate[] => {
    return days.map((date) => {
      // Rooms available on this date (available_from <= date)
      const h3RoomsAvailable = rooms.filter(r => 
        r.hotel === 'H3' && 
        !isAfter(parseISO(r.available_from), date)
      )
      const h4RoomsAvailable = rooms.filter(r => 
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
  }, [days, rooms, bookings])

  // Room type breakdown
  const h3Breakdown = useMemo(() => {
    const h3 = rooms.filter(r => r.hotel === 'H3')
    return {
      double: h3.filter(r => r.room_type === 'double').length,
      triple_3beds: h3.filter(r => r.room_type === 'triple_3beds').length,
      triple_double_single: h3.filter(r => r.room_type === 'triple_double_single').length,
      quadruple: h3.filter(r => r.room_type === 'quadruple').length,
    }
  }, [rooms])

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

  const filteredRooms = rooms.filter(r => hotelFilter === 'all' || r.hotel === hotelFilter)

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
          <h3 className="font-semibold text-foreground mb-3">H3 - Standard Hotel (230 rooms max)</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Double (can be single):</span>
              <span className="text-foreground">{h3Breakdown.double}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Triple (3 beds):</span>
              <span className="text-foreground">{h3Breakdown.triple_3beds}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Triple (dbl+sgl):</span>
              <span className="text-foreground">{h3Breakdown.triple_double_single}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quadruple (4 beds):</span>
              <span className="text-foreground">{h3Breakdown.quadruple}</span>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="font-semibold text-foreground mb-3">H4 - Upgraded Hotel (50 rooms max)</h3>
          <div className="text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Double (can be single):</span>
              <span className="text-foreground">{rooms.filter(r => r.hotel === 'H4').length}</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            All rooms are double rooms that can be used as single
          </div>
        </div>
      </div>

      {/* Availability Overview */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="font-semibold text-foreground mb-4">Daily Availability Overview</h3>
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
                <tr key={date.toISOString()} className="border-b border-border/50">
                  <td className="px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{format(date, 'EEE, MMM d')}</span>
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
                        {room.hotel} - {room.room_type === 'triple_3beds' ? 'Triple (3)' : 
                          room.room_type === 'triple_double_single' ? 'Triple (d+s)' : 
                          room.room_type === 'quadruple' ? 'Quad' : 'Double'}
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
        Total: {rooms.length} rooms (H3: {rooms.filter(r => r.hotel === 'H3').length}, H4: {rooms.filter(r => r.hotel === 'H4').length})
      </div>
    </div>
  )
}
