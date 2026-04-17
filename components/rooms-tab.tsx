'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Room, Guest, Booking } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Pencil, Trash2, X, Check, Users, Music, Wand2, Download } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { SortHeader, compareBy, SortState } from '@/components/sort-header'

type RoomSortKey =
  | 'room_number'
  | 'hotel'
  | 'room_type'
  | 'capacity'
  | 'available_from'
  | 'occupants'
  | 'status'
  | 'is_staff'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { format, parseISO } from 'date-fns'

const roomTypes = ['double', 'triple_3beds', 'triple_double_single', 'quadruple'] as const
const hotels = ['H3', 'H4'] as const
const statusOptions = ['available', 'occupied', 'maintenance', 'cleaning'] as const

const statusColors: Record<string, string> = {
  available: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  occupied: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  maintenance: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  cleaning: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

const typeColors: Record<string, string> = {
  double: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  triple_3beds: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  triple_double_single: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  quadruple: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
}

const hotelColors: Record<string, string> = {
  H3: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  H4: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

const typeLabels: Record<string, string> = {
  double: 'Double',
  triple_3beds: 'Triple (3 beds)',
  triple_double_single: 'Triple (dbl+sgl)',
  quadruple: 'Quadruple (4 beds)',
}

export function RoomsTab() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [hotelFilter, setHotelFilter] = useState<'all' | 'H3' | 'H4'>('all')
  const [useFilter, setUseFilter] = useState<'all' | 'guest' | 'staff'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Room>>({})
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newRoom, setNewRoom] = useState({
    room_number: '',
    hotel: 'H3' as Room['hotel'],
    room_type: 'double' as Room['room_type'],
    capacity: 2,
    available_from: '2026-09-07',
    status: 'available' as Room['status'],
    is_staff: false,
  })

  const [guests, setGuests] = useState<Guest[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [sort, setSort] = useState<SortState<RoomSortKey>>({ key: 'room_number', dir: 'asc' })

  const supabase = createClient()

  const fetchRooms = useCallback(async () => {
    const [r, g, b] = await Promise.all([
      supabase.from('rooms').select('*').order('hotel', { ascending: true }).order('room_number', { ascending: true }),
      supabase.from('guests').select('*'),
      supabase.from('bookings').select('*'),
    ])
    if (r.data) setRooms(r.data)
    if (g.data) setGuests(g.data)
    if (b.data) setBookings(b.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  // Build: room_id -> list of occupant Guest objects (from active bookings)
  const occupantsByRoom = new Map<string, Guest[]>()
  for (const b of bookings) {
    if (b.status === 'cancelled') continue
    const guest = guests.find((g) => g.id === b.guest_id)
    if (!guest) continue
    const list = occupantsByRoom.get(b.room_id) ?? []
    list.push(guest)
    occupantsByRoom.set(b.room_id, list)
  }

  const filteredRooms = rooms.filter((room) => {
    const matchesSearch =
      room.room_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.room_type.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesHotel = hotelFilter === 'all' || room.hotel === hotelFilter
    const matchesUse =
      useFilter === 'all' ||
      (useFilter === 'staff' && room.is_staff) ||
      (useFilter === 'guest' && !room.is_staff)
    return matchesSearch && matchesHotel && matchesUse
  })

  const sortedRooms = [...filteredRooms].sort(
    compareBy((r) => {
      switch (sort.key) {
        case 'room_number':
          return Number(r.room_number)
        case 'occupants':
          return occupantsByRoom.get(r.id)?.length ?? 0
        case 'is_staff':
          return r.is_staff ? 1 : 0
        case 'status':
          // Derived display status (occupied if any occupants, unless manually set)
          const occ = occupantsByRoom.get(r.id)?.length ?? 0
          return r.status === 'maintenance' || r.status === 'cleaning'
            ? r.status
            : occ > 0 ? 'occupied' : 'available'
        default:
          return (r as Record<string, unknown>)[sort.key] as string | number | null
      }
    }, sort.dir),
  )

  // Room summary stats
  const h3Rooms = rooms.filter(r => r.hotel === 'H3')
  const h4Rooms = rooms.filter(r => r.hotel === 'H4')
  const h3Double = h3Rooms.filter(r => r.room_type === 'double').length
  const h3Triple3 = h3Rooms.filter(r => r.room_type === 'triple_3beds').length
  const h3TripleDS = h3Rooms.filter(r => r.room_type === 'triple_double_single').length
  const h3Quad = h3Rooms.filter(r => r.room_type === 'quadruple').length
  const staffCount = rooms.filter(r => r.is_staff).length
  const guestRoomCount = rooms.length - staffCount

  const handleAddRoom = async () => {
    if (!newRoom.room_number) return
    const { error } = await supabase.from('rooms').insert([newRoom])
    if (!error) {
      fetchRooms()
      setIsAddDialogOpen(false)
      setNewRoom({
        room_number: '',
        hotel: 'H3',
        room_type: 'double',
        capacity: 2,
        available_from: '2026-09-07',
        status: 'available',
        is_staff: false,
      })
    }
  }

  const handleUpdateRoom = async (id: string) => {
    const { error } = await supabase.from('rooms').update(editForm).eq('id', id)
    if (!error) {
      fetchRooms()
      setEditingId(null)
      setEditForm({})
    }
  }

  const handleDeleteRoom = async (id: string) => {
    const { error } = await supabase.from('rooms').delete().eq('id', id)
    if (!error) fetchRooms()
  }

  // Auto-assign all unassigned guests to empty rooms.
  // Strategy: group unassigned guests by order_code (people on the same
  // order usually share a room). For each group, find the first empty
  // non-staff room in that guest's hotel with capacity >= group size,
  // and assign the whole group to it. Groups that can't fit are skipped
  // so the user can handle them manually.
  const [bulkBusy, setBulkBusy] = useState(false)
  const handleAutoAssign = async () => {
    setBulkBusy(true)
    const assignedGuestIds = new Set(
      bookings.filter((b) => b.status !== 'cancelled').map((b) => b.guest_id),
    )
    const unassigned = guests.filter(
      (g) => !assignedGuestIds.has(g.id) && g.hotel && g.check_in_date && g.check_out_date,
    )

    // Group by order_code
    const groups = new Map<string, Guest[]>()
    for (const g of unassigned) {
      const key = g.order_code
      const arr = groups.get(key) ?? []
      arr.push(g)
      groups.set(key, arr)
    }

    // Track which rooms we've just filled in this batch
    const filled = new Set<string>()
    const newBookings: Array<{
      guest_id: string
      room_id: string
      check_in_date: string
      check_out_date: string
      status: string
    }> = []
    let skipped = 0

    // Sort group entries so larger groups go first (easier to place before small
    // ones take all the big rooms)
    const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
    for (const [, members] of entries) {
      const hotel = members[0].hotel
      const size = members.length
      const room = rooms.find((r) =>
        !r.is_staff &&
        r.hotel === hotel &&
        r.capacity >= size &&
        !filled.has(r.id) &&
        (occupantsByRoom.get(r.id)?.length ?? 0) === 0,
      )
      if (!room) {
        skipped += size
        continue
      }
      filled.add(room.id)
      for (const g of members) {
        newBookings.push({
          guest_id: g.id,
          room_id: room.id,
          check_in_date: g.check_in_date!,
          check_out_date: g.check_out_date!,
          status: 'confirmed',
        })
      }
    }

    if (newBookings.length > 0) {
      const { error } = await supabase.from('bookings').insert(newBookings)
      if (error) {
        alert(`Insert failed: ${error.message}`)
        setBulkBusy(false)
        return
      }
    }

    await fetchRooms()
    setBulkBusy(false)
    alert(
      `Auto-assign complete.\n\n` +
        `Placed: ${newBookings.length} guest(s) across ${filled.size} room(s).\n` +
        (skipped > 0 ? `Skipped: ${skipped} guest(s) — no matching empty room.` : ''),
    )
  }

  // CSV export — full rooming list (one row per booked guest)
  const handleExportCSV = () => {
    const header = ['room_number', 'hotel', 'room_type', 'capacity', 'guest_name', 'order_code', 'role', 'country', 'ticket_type', 'check_in', 'check_out']
    const rows: string[][] = [header]
    const sortedByRoom = [...rooms].sort((a, b) => Number(a.room_number) - Number(b.room_number))
    for (const room of sortedByRoom) {
      const occ = occupantsByRoom.get(room.id) ?? []
      if (occ.length === 0) {
        rows.push([room.room_number, room.hotel, room.room_type, String(room.capacity), room.is_staff ? '(STAFF ROOM)' : '(EMPTY)', '', '', '', '', '', ''])
        continue
      }
      for (const g of occ) {
        rows.push([
          room.room_number,
          room.hotel,
          room.room_type,
          String(room.capacity),
          g.full_name,
          g.order_code,
          g.role,
          g.country ?? '',
          g.ticket_type,
          g.check_in_date ?? '',
          g.check_out_date ?? '',
        ])
      }
    }
    // Escape fields that contain quotes, commas, or newlines
    const csv = rows
      .map((r) =>
        r
          .map((v) => {
            if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
            return v
          })
          .join(','),
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `salsarave-2026-rooming-list-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleToggleStaff = async (room: Room, next: boolean) => {
    // Optimistic local update, then write. Default available_from when flipping
    // to staff: Sep 7 for H4, Sep 8 for H3 (matches event setup schedule).
    setRooms((rs) => rs.map((r) => (r.id === room.id ? { ...r, is_staff: next } : r)))
    const available_from = next ? (room.hotel === 'H4' ? '2026-09-07' : '2026-09-08') : room.available_from
    const { error } = await supabase
      .from('rooms')
      .update({ is_staff: next, available_from })
      .eq('id', room.id)
    if (error) fetchRooms()
  }

  const startEditing = (room: Room) => {
    setEditingId(room.id)
    setEditForm(room)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="text-2xl font-bold text-amber-400">{h4Rooms.length}</div>
          <div className="text-sm text-muted-foreground">H4 (Upgraded)</div>
          <div className="text-xs text-muted-foreground mt-1">50 max - All double</div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="text-2xl font-bold text-slate-300">{h3Rooms.length}</div>
          <div className="text-sm text-muted-foreground">H3 (Standard)</div>
          <div className="text-xs text-muted-foreground mt-1">230 max</div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="text-sm font-medium text-foreground">H3 Breakdown</div>
          <div className="text-xs text-muted-foreground mt-1">
            {h3Double} double, {h3Triple3} triple (3), {h3TripleDS} triple (d+s), {h3Quad} quad
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="text-2xl font-bold text-primary">{rooms.length}</div>
          <div className="text-sm text-muted-foreground">Total Rooms</div>
          <div className="text-xs text-muted-foreground mt-1">
            {guestRoomCount} guest · <span className="text-amber-400">{staffCount} staff</span> / 30
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
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
          <Select value={useFilter} onValueChange={(v) => setUseFilter(v as typeof useFilter)}>
            <SelectTrigger className="w-36 bg-card border-border">
              <SelectValue placeholder="Use" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Uses</SelectItem>
              <SelectItem value="guest">Guests</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{sortedRooms.length} rooms</span>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleAutoAssign}
            disabled={bulkBusy}
            title="Group unassigned guests by order and drop each group into an empty matching room"
          >
            <Wand2 className="size-4" />
            {bulkBusy ? 'Assigning...' : 'Auto-assign'}
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
            <Download className="size-4" />
            Export CSV
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                Add Room
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Add New Room</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="Room Number *"
                    value={newRoom.room_number}
                    onChange={(e) => setNewRoom({ ...newRoom, room_number: e.target.value })}
                    className="bg-secondary border-border"
                  />
                  <Select
                    value={newRoom.hotel}
                    onValueChange={(value: Room['hotel']) => setNewRoom({ ...newRoom, hotel: value })}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Hotel" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {hotels.map((hotel) => (
                        <SelectItem key={hotel} value={hotel}>
                          {hotel === 'H4' ? 'H4 (Upgraded)' : 'H3 (Standard)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    value={newRoom.room_type}
                    onValueChange={(value: Room['room_type']) => {
                      const capacity = value === 'quadruple' ? 4 : value.includes('triple') ? 3 : 2
                      setNewRoom({ ...newRoom, room_type: value, capacity })
                    }}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Room Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {roomTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {typeLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Capacity"
                    value={newRoom.capacity}
                    onChange={(e) => setNewRoom({ ...newRoom, capacity: parseInt(e.target.value) || 2 })}
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="date"
                    value={newRoom.available_from}
                    onChange={(e) => setNewRoom({ ...newRoom, available_from: e.target.value })}
                    className="bg-secondary border-border"
                  />
                  <Select
                    value={newRoom.status}
                    onValueChange={(value: Room['status']) => setNewRoom({ ...newRoom, status: value })}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center justify-between bg-secondary border border-border rounded-md px-3 py-2">
                  <span className="text-sm">Staff room</span>
                  <Switch
                    checked={newRoom.is_staff}
                    onCheckedChange={(v) => setNewRoom({ ...newRoom, is_staff: v })}
                  />
                </label>
                <Button onClick={handleAddRoom} className="w-full">
                  Add Room
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-secondary">
            <tr>
              <SortHeader label="Room #" sortKey="room_number" state={sort} onSort={setSort} />
              <SortHeader label="Hotel" sortKey="hotel" state={sort} onSort={setSort} />
              <SortHeader label="Type" sortKey="room_type" state={sort} onSort={setSort} />
              <SortHeader label="Capacity" sortKey="capacity" state={sort} onSort={setSort} />
              <SortHeader label="Available From" sortKey="available_from" state={sort} onSort={setSort} />
              <SortHeader label="Occupants" sortKey="occupants" state={sort} onSort={setSort} />
              <SortHeader label="Status" sortKey="status" state={sort} onSort={setSort} />
              <SortHeader label="Use" sortKey="is_staff" state={sort} onSort={setSort} />
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedRooms.map((room) => (
              <tr key={room.id} className="bg-card hover:bg-secondary/50 transition-colors">
                {editingId === room.id ? (
                  <>
                    <td className="px-4 py-3">
                      <Input
                        value={editForm.room_number || ''}
                        onChange={(e) => setEditForm({ ...editForm, room_number: e.target.value })}
                        className="h-8 w-24 text-sm bg-secondary border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={editForm.hotel}
                        onValueChange={(value: Room['hotel']) => setEditForm({ ...editForm, hotel: value })}
                      >
                        <SelectTrigger className="h-8 w-28 text-sm bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {hotels.map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={editForm.room_type}
                        onValueChange={(value: Room['room_type']) => setEditForm({ ...editForm, room_type: value })}
                      >
                        <SelectTrigger className="h-8 w-36 text-sm bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {roomTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {typeLabels[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        value={editForm.capacity || 2}
                        onChange={(e) => setEditForm({ ...editForm, capacity: parseInt(e.target.value) || 2 })}
                        className="h-8 w-16 text-sm bg-secondary border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="date"
                        value={editForm.available_from || ''}
                        onChange={(e) => setEditForm({ ...editForm, available_from: e.target.value })}
                        className="h-8 w-32 text-sm bg-secondary border-border"
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {(occupantsByRoom.get(room.id)?.length ?? 0)}/{editForm.capacity ?? room.capacity}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={editForm.status}
                        onValueChange={(value: Room['status']) => setEditForm({ ...editForm, status: value })}
                      >
                        <SelectTrigger className="h-8 w-28 text-sm bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {statusOptions.map((status) => (
                            <SelectItem key={status} value={status} className="capitalize">
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <Switch
                          checked={!!editForm.is_staff}
                          onCheckedChange={(v) => setEditForm({ ...editForm, is_staff: v })}
                          aria-label="Staff room"
                        />
                        <span className={editForm.is_staff ? 'text-amber-400' : 'text-muted-foreground'}>
                          {editForm.is_staff ? 'Staff' : 'Guest'}
                        </span>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-primary hover:text-primary"
                          onClick={() => handleUpdateRoom(room.id)}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingId(null)
                            setEditForm({})
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{room.room_number}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md border ${hotelColors[room.hotel]}`}>
                        {room.hotel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md border ${typeColors[room.room_type]}`}>
                        {typeLabels[room.room_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{room.capacity}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {format(parseISO(room.available_from), 'MMM d')}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(() => {
                        const occ = occupantsByRoom.get(room.id) ?? []
                        if (occ.length === 0) return <span className="text-muted-foreground">Empty</span>
                        const names = occ.map((g) => g.full_name).join(', ')
                        const full = occ.length >= room.capacity
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-foreground truncate max-w-[220px]" title={names}>{names}</span>
                            <span className={full ? 'text-red-400' : 'text-emerald-400'}>
                              {occ.length}/{room.capacity}
                            </span>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const occ = occupantsByRoom.get(room.id)?.length ?? 0
                        const displayStatus =
                          room.status === 'maintenance' || room.status === 'cleaning'
                            ? room.status
                            : occ > 0
                              ? 'occupied'
                              : 'available'
                        return (
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md border capitalize ${statusColors[displayStatus]}`}>
                            {displayStatus}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <Switch
                          checked={room.is_staff}
                          onCheckedChange={(v) => handleToggleStaff(room, v)}
                          aria-label="Staff room"
                        />
                        <span className={`inline-flex items-center gap-1 ${room.is_staff ? 'text-amber-400' : 'text-muted-foreground'}`}>
                          {room.is_staff ? <Music className="size-3" /> : <Users className="size-3" />}
                          {room.is_staff ? 'Staff' : 'Guest'}
                        </span>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditing(room)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteRoom(room.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {sortedRooms.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No rooms found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
