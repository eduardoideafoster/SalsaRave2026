'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Room, Guest, Booking } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Pencil, Trash2, X, Check, Users, Music, Wand2, Download, Upload } from 'lucide-react'
import { generateCSV, downloadCSV, csvToObjects } from '@/lib/csv'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SortHeader, compareBy, SortState } from '@/components/sort-header'
import { useT } from '@/lib/i18n'
import { RoomDetailDialog } from '@/components/room-detail-dialog'

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
import { Checkbox } from '@/components/ui/checkbox'
import { format, parseISO } from 'date-fns'

const roomTypes = ['single', 'double', 'triple', 'quadruple'] as const
const hotels = ['H3', 'H4'] as const
const statusOptions = ['available', 'occupied', 'maintenance', 'cleaning'] as const

const statusColors: Record<string, string> = {
  available: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  occupied: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  maintenance: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  cleaning: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

const typeColors: Record<string, string> = {
  single: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  double: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  triple: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  quadruple: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
}

const hotelColors: Record<string, string> = {
  H3: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  H4: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

const typeLabels: Record<string, string> = {
  single: 'Single',
  double: 'Double',
  triple: 'Triple',
  quadruple: 'Quadruple',
}

interface RoomsTabProps {
  onOpenGuest?: (id: string) => void
}

export function RoomsTab({ onOpenGuest }: RoomsTabProps = {}) {
  const t = useT()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [hotelFilter, setHotelFilter] = useState<'all' | 'H3' | 'H4'>('all')
  const [useFilter, setUseFilter] = useState<'all' | 'guest' | 'staff'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [occupancyFilter, setOccupancyFilter] = useState<string>('all') // all | empty | partial | full
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
  const [detailRoom, setDetailRoom] = useState<Room | null>(null)
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set())
  const [bulkRoomPatch, setBulkRoomPatch] = useState<Partial<Room>>({})

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
    const q = searchQuery.toLowerCase()
    const occOf = occupantsByRoom.get(room.id) ?? []
    const matchesSearch =
      !q ||
      room.room_number.toLowerCase().includes(q) ||
      room.room_type.toLowerCase().includes(q) ||
      occOf.some(
        (g) =>
          g.full_name.toLowerCase().includes(q) ||
          g.order_code.toLowerCase().includes(q),
      )
    const matchesHotel = hotelFilter === 'all' || room.hotel === hotelFilter
    const matchesUse =
      useFilter === 'all' ||
      (useFilter === 'staff' && room.is_staff) ||
      (useFilter === 'guest' && !room.is_staff)
    const matchesType = typeFilter === 'all' || room.room_type === typeFilter
    const occ = occupantsByRoom.get(room.id)?.length ?? 0
    const derivedStatus =
      room.status === 'maintenance' || room.status === 'cleaning' || room.status === 'blocked'
        ? room.status
        : occ > 0
          ? 'occupied'
          : 'available'
    const matchesStatus = statusFilter === 'all' || derivedStatus === statusFilter
    const matchesOccupancy =
      occupancyFilter === 'all' ||
      (occupancyFilter === 'empty' && occ === 0) ||
      (occupancyFilter === 'partial' && occ > 0 && occ < room.capacity) ||
      (occupancyFilter === 'full' && occ >= room.capacity)
    return matchesSearch && matchesHotel && matchesUse && matchesType && matchesStatus && matchesOccupancy
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
          return r.status === 'maintenance' || r.status === 'cleaning' || r.status === 'blocked'
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
  const h3Triple = h3Rooms.filter(r => r.room_type === 'triple').length
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
    const room = rooms.find((r) => r.id === id)
    const label = room ? `room ${room.room_number} (${room.hotel})` : 'this room'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    const { error } = await supabase.from('rooms').delete().eq('id', id)
    if (!error) fetchRooms()
  }

  const toggleSelectedRoom = (id: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearRoomSelection = () => {
    setSelectedRoomIds(new Set())
    setBulkRoomPatch({})
  }

  const applyBulkRoomPatch = async () => {
    const ids = Array.from(selectedRoomIds)
    if (ids.length === 0) return
    const patch = { ...bulkRoomPatch }
    if (Object.keys(patch).length === 0) return
    const { error } = await supabase.from('rooms').update(patch).in('id', ids)
    if (!error) {
      await fetchRooms()
      clearRoomSelection()
    }
  }

  const deleteSelectedRooms = async () => {
    const ids = Array.from(selectedRoomIds)
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} room(s)? This cannot be undone.`)) return
    const { error } = await supabase.from('rooms').delete().in('id', ids)
    if (!error) {
      await fetchRooms()
      clearRoomSelection()
    }
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
  const handleExportRoomingCSV = () => {
    const headers = ['room_number', 'hotel', 'room_type', 'capacity', 'guest_name', 'order_code', 'role', 'country', 'ticket_type', 'check_in', 'check_out']
    const rows: string[][] = []
    const sortedByRoom = [...rooms].sort((a, b) => Number(a.room_number) - Number(b.room_number))
    for (const room of sortedByRoom) {
      const occ = occupantsByRoom.get(room.id) ?? []
      if (occ.length === 0) {
        rows.push([room.room_number, room.hotel, room.room_type, String(room.capacity), room.is_staff ? '(STAFF ROOM)' : '(EMPTY)', '', '', '', '', '', ''])
        continue
      }
      for (const g of occ) {
        rows.push([room.room_number, room.hotel, room.room_type, String(room.capacity), g.full_name, g.order_code, g.role, g.country ?? '', g.ticket_type, g.check_in_date ?? '', g.check_out_date ?? ''])
      }
    }
    downloadCSV(generateCSV(headers, rows), `salsarave-2026-rooming-list-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // CSV export — rooms inventory only
  const handleExportRoomsCSV = () => {
    const headers = ['room_number', 'hotel', 'room_type', 'capacity', 'available_from', 'status', 'is_staff', 'notes']
    const rows = sortedRooms.map((r) => [
      r.room_number,
      r.hotel,
      r.room_type,
      String(r.capacity),
      r.available_from,
      r.status,
      r.is_staff ? 'true' : 'false',
      r.notes ?? '',
    ])
    downloadCSV(generateCSV(headers, rows), `salsarave-2026-rooms-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const [importBusy, setImportBusy] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; updated: number; errors: string[] } | null>(null)

  const handleImportRoomsCSV = async (file: File) => {
    setImportBusy(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const records = csvToObjects(text)
      if (records.length === 0) {
        setImportResult({ added: 0, updated: 0, errors: ['CSV is empty or has no data rows'] })
        return
      }
      const first = records[0]
      if (!first['room_number'] || !first['hotel']) {
        setImportResult({ added: 0, updated: 0, errors: ['CSV must have room_number and hotel columns'] })
        return
      }

      const validTypes = ['single', 'double', 'triple', 'quadruple']
      const validStatuses = ['available', 'occupied', 'maintenance', 'cleaning', 'blocked']
      let added = 0
      let updated = 0
      const errors: string[] = []

      for (const rec of records) {
        const roomType = validTypes.includes(rec['room_type']) ? rec['room_type'] : 'double'
        const capacityMap: Record<string, number> = { single: 1, double: 2, triple: 3, quadruple: 4 }
        const roomData: Record<string, unknown> = {
          room_number: rec['room_number'],
          hotel: (['H3', 'H4'].includes(rec['hotel']) ? rec['hotel'] : 'H3'),
          room_type: roomType,
          capacity: rec['capacity'] ? parseInt(rec['capacity'], 10) : capacityMap[roomType],
          available_from: rec['available_from'] || '2026-09-10',
          status: validStatuses.includes(rec['status']) ? rec['status'] : 'available',
          is_staff: rec['is_staff'] === 'true',
        }
        if (rec['notes']) roomData.notes = rec['notes']

        const existing = rooms.find(
          (r) => r.room_number === rec['room_number'] && r.hotel === rec['hotel'],
        )

        if (existing) {
          const { error } = await supabase.from('rooms').update(roomData).eq('id', existing.id)
          if (error) errors.push(`Update failed for room ${rec['room_number']}: ${error.message}`)
          else updated++
        } else {
          const { error } = await supabase.from('rooms').insert([roomData])
          if (error) errors.push(`Insert failed for room ${rec['room_number']}: ${error.message}`)
          else added++
        }
      }

      setImportResult({ added, updated, errors })
      await fetchRooms()
    } catch (err) {
      setImportResult({ added: 0, updated: 0, errors: [`Parse error: ${(err as Error).message}`] })
    } finally {
      setImportBusy(false)
    }
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
            {h3Double} double, {h3Triple} triple, {h3Quad} quad
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="text-2xl font-bold text-primary">{rooms.length}</div>
          <div className="text-sm text-muted-foreground">Total Rooms</div>
          <div className="text-xs text-muted-foreground mt-1">
            {guestRoomCount} SalsaRaver · <span className="text-amber-400">{staffCount} Core Tribe</span> / 30
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3 sm:gap-4">
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-4 w-full lg:w-auto">
          <div className="relative col-span-2 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t('rooms.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          <Select value={hotelFilter} onValueChange={(v) => setHotelFilter(v as typeof hotelFilter)}>
            <SelectTrigger className="w-full sm:w-40 bg-card border-border">
              <SelectValue placeholder={t('filter.hotel')} />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">{t('filter.allHotels')}</SelectItem>
              <SelectItem value="H3">{t('hotel.H3')}</SelectItem>
              <SelectItem value="H4">{t('hotel.H4')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={useFilter} onValueChange={(v) => setUseFilter(v as typeof useFilter)}>
            <SelectTrigger className="w-full sm:w-36 bg-card border-border">
              <SelectValue placeholder={t('filter.use')} />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">{t('filter.allUses')}</SelectItem>
              <SelectItem value="guest">{t('filter.guests')}</SelectItem>
              <SelectItem value="staff">{t('filter.staff')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-36 bg-card border-border"><SelectValue placeholder={t('filter.type')} /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">{t('filter.allTypes')}</SelectItem>
              <SelectItem value="single">{t('type.single')}</SelectItem>
              <SelectItem value="double">{t('type.double')}</SelectItem>
              <SelectItem value="triple">{t('type.triple')}</SelectItem>
              <SelectItem value="quadruple">{t('type.quadruple')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36 bg-card border-border"><SelectValue placeholder={t('filter.status')} /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">{t('filter.allStatuses')}</SelectItem>
              <SelectItem value="available">{t('status.available')}</SelectItem>
              <SelectItem value="occupied">{t('status.occupied')}</SelectItem>
              <SelectItem value="maintenance">{t('status.maintenance')}</SelectItem>
              <SelectItem value="cleaning">{t('status.cleaning')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={occupancyFilter} onValueChange={setOccupancyFilter}>
            <SelectTrigger className="w-full sm:w-36 bg-card border-border"><SelectValue placeholder={t('filter.fill')} /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">{t('filter.anyFill')}</SelectItem>
              <SelectItem value="empty">{t('common.empty')}</SelectItem>
              <SelectItem value="partial">{t('filter.partial')}</SelectItem>
              <SelectItem value="full">{t('filter.full')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap w-full lg:w-auto">
          <span className="text-sm text-muted-foreground mr-auto lg:mr-0">{sortedRooms.length} rooms</span>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleAutoAssign}
            disabled={bulkBusy}
            title="Group unassigned guests by order and drop each group into an empty matching room"
          >
            <Wand2 className="size-4" />
            <span className="hidden sm:inline">{bulkBusy ? 'Assigning...' : 'Auto-assign'}</span>
            <span className="sm:hidden">{bulkBusy ? '...' : 'Auto'}</span>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="size-4" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">CSV↓</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 bg-card border-border p-2" align="end">
              <Button variant="ghost" className="w-full justify-start text-sm" onClick={handleExportRoomsCSV}>
                Rooms inventory
              </Button>
              <Button variant="ghost" className="w-full justify-start text-sm" onClick={handleExportRoomingCSV}>
                Rooming list (with guests)
              </Button>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            className="gap-2"
            disabled={importBusy}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.csv,text/csv'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) handleImportRoomsCSV(file)
              }
              input.click()
            }}
          >
            <Upload className="size-4" />
            <span className="hidden sm:inline">{importBusy ? 'Importing...' : 'Import CSV'}</span>
            <span className="sm:hidden">{importBusy ? '...' : 'CSV↑'}</span>
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                {t('rooms.add')}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">{t('rooms.addNew')}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder={`${t('rooms.number')} *`}
                    value={newRoom.room_number}
                    onChange={(e) => setNewRoom({ ...newRoom, room_number: e.target.value })}
                    className="bg-secondary border-border"
                  />
                  <Select
                    value={newRoom.hotel}
                    onValueChange={(value: Room['hotel']) => setNewRoom({ ...newRoom, hotel: value })}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder={t('guests.hotel')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {hotels.map((hotel) => (
                        <SelectItem key={hotel} value={hotel}>
                          {t(`hotel.${hotel}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    value={newRoom.room_type}
                    onValueChange={(value: Room['room_type']) => {
                      const capacity = value === 'quadruple' ? 4 : value.includes('triple') ? 3 : value === 'single' ? 1 : 2
                      setNewRoom({ ...newRoom, room_type: value, capacity })
                    }}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder={t('rooms.type')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {roomTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`type.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder={t('rooms.capacity')}
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
                      <SelectValue placeholder={t('filter.status')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {t(`status.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center justify-between bg-secondary border border-border rounded-md px-3 py-2">
                  <span className="text-sm">{t('rooms.staffRoom')}</span>
                  <Switch
                    checked={newRoom.is_staff}
                    onCheckedChange={(v) => setNewRoom({ ...newRoom, is_staff: v })}
                  />
                </label>
                <Button onClick={handleAddRoom} className="w-full">
                  {t('rooms.add')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {importResult && (
        <div className={`rounded-md border p-3 text-sm flex items-start justify-between ${importResult.errors.length > 0 ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}>
          <div>
            <span className="font-medium">Import: </span>
            {importResult.added} added, {importResult.updated} updated
            {importResult.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-xs">
                {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {importResult.errors.length > 5 && <li>…and {importResult.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setImportResult(null)}>
            <X className="size-4" />
          </Button>
        </div>
      )}

      {selectedRoomIds.size > 0 && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium text-foreground">
              {selectedRoomIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={clearRoomSelection}>
                <X className="size-4 mr-1" />Clear
              </Button>
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={deleteSelectedRooms}>
                <Trash2 className="size-4 mr-1" />Delete selected
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Hotel</span>
              <Select
                value={bulkRoomPatch.hotel ?? '__skip__'}
                onValueChange={(v) =>
                  setBulkRoomPatch({ ...bulkRoomPatch, hotel: v === '__skip__' ? undefined : (v as 'H3' | 'H4') })
                }
              >
                <SelectTrigger className="h-8 w-24 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__skip__">— skip —</SelectItem>
                  <SelectItem value="H3">H3</SelectItem>
                  <SelectItem value="H4">H4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Type</span>
              <Select
                value={(bulkRoomPatch.room_type as string) ?? '__skip__'}
                onValueChange={(v) =>
                  setBulkRoomPatch({ ...bulkRoomPatch, room_type: v === '__skip__' ? undefined : (v as Room['room_type']) })
                }
              >
                <SelectTrigger className="h-8 w-32 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__skip__">— skip —</SelectItem>
                  <SelectItem value="single">single</SelectItem>
                  <SelectItem value="double">double</SelectItem>
                  <SelectItem value="triple">triple</SelectItem>
                  <SelectItem value="quadruple">quadruple</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Capacity</span>
              <Input
                type="number"
                min={1}
                max={6}
                value={bulkRoomPatch.capacity ?? ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  setBulkRoomPatch({ ...bulkRoomPatch, capacity: Number.isFinite(n) ? n : undefined })
                }}
                placeholder="—"
                className="h-8 w-20 text-sm bg-card border-border"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <Select
                value={(bulkRoomPatch.status as string) ?? '__skip__'}
                onValueChange={(v) =>
                  setBulkRoomPatch({ ...bulkRoomPatch, status: v === '__skip__' ? undefined : (v as Room['status']) })
                }
              >
                <SelectTrigger className="h-8 w-36 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__skip__">— skip —</SelectItem>
                  <SelectItem value="available">available</SelectItem>
                  <SelectItem value="occupied">occupied</SelectItem>
                  <SelectItem value="cleaning">cleaning</SelectItem>
                  <SelectItem value="maintenance">maintenance</SelectItem>
                  <SelectItem value="blocked">blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Use</span>
              <Select
                value={
                  bulkRoomPatch.is_staff === undefined ? '__skip__' : bulkRoomPatch.is_staff ? 'staff' : 'guest'
                }
                onValueChange={(v) =>
                  setBulkRoomPatch({
                    ...bulkRoomPatch,
                    is_staff: v === '__skip__' ? undefined : v === 'staff',
                  })
                }
              >
                <SelectTrigger className="h-8 w-28 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__skip__">— skip —</SelectItem>
                  <SelectItem value="guest">guest</SelectItem>
                  <SelectItem value="staff">staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Available from</span>
              <Input
                type="date"
                value={bulkRoomPatch.available_from ?? ''}
                onChange={(e) =>
                  setBulkRoomPatch({ ...bulkRoomPatch, available_from: e.target.value || undefined })
                }
                className="h-8 w-36 text-sm bg-card border-border"
              />
            </div>
            <Button size="sm" onClick={applyBulkRoomPatch} disabled={Object.keys(bulkRoomPatch).length === 0}>
              <Check className="size-4 mr-1" />Apply to {selectedRoomIds.size}
            </Button>
          </div>
        </div>
      )}

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {sortedRooms.map((room) => {
          const occ = occupantsByRoom.get(room.id) ?? []
          const displayStatus =
            room.status === 'maintenance' || room.status === 'cleaning' || room.status === 'blocked'
              ? room.status
              : occ.length > 0
                ? 'occupied'
                : 'available'
          return (
            <div key={room.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Checkbox
                    checked={selectedRoomIds.has(room.id)}
                    onCheckedChange={() => toggleSelectedRoom(room.id)}
                    aria-label={`Select room ${room.room_number}`}
                  />
                  <button
                    type="button"
                    onClick={() => setDetailRoom(room)}
                    className="font-semibold text-foreground font-mono hover:text-primary underline-offset-2 hover:underline"
                  >
                    #{room.room_number}
                  </button>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md border ${hotelColors[room.hotel]}`}>
                    {room.hotel}
                  </span>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md border ${typeColors[room.room_type]}`}>
                    {typeLabels[room.room_type]}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => startEditing(room)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteRoom(room.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className={`inline-flex px-2 py-0.5 rounded-md border font-medium capitalize ${statusColors[displayStatus]}`}>
                  {displayStatus}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-medium ${room.is_staff ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-secondary text-muted-foreground border-border'}`}>
                  {room.is_staff ? <Music className="size-3" /> : <Users className="size-3" />}
                  {room.is_staff ? t('use.staff') : t('use.guest')}
                </span>
                <span className={`inline-flex px-2 py-0.5 rounded-md border font-medium ${
                  occ.length >= room.capacity ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : occ.length > 0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-secondary text-muted-foreground border-border'
                }`}>
                  {occ.length}/{room.capacity}
                </span>
              </div>
              {occ.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  <span className="text-foreground">
                    {occ.map((g, i) => (
                      <span key={g.id}>
                        {i > 0 && ', '}
                        <button
                          type="button"
                          onClick={() => onOpenGuest?.(g.id)}
                          className="hover:text-primary underline-offset-2 hover:underline"
                        >
                          {g.full_name}
                        </button>
                      </span>
                    ))}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {t('common.empty')} · {t('rooms.availableFrom')} {format(parseISO(room.available_from), 'MMM d')}
                </div>
              )}
            </div>
          )
        })}
        {sortedRooms.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No rooms found
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-3 w-10">
                <Checkbox
                  checked={
                    sortedRooms.length > 0 && sortedRooms.every((r) => selectedRoomIds.has(r.id))
                  }
                  onCheckedChange={(v) => {
                    setSelectedRoomIds((prev) => {
                      const next = new Set(prev)
                      if (v) for (const r of sortedRooms) next.add(r.id)
                      else for (const r of sortedRooms) next.delete(r.id)
                      return next
                    })
                  }}
                  aria-label="Select all visible rooms"
                />
              </th>
              <SortHeader label={t('rooms.number')} sortKey="room_number" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.hotel')} sortKey="hotel" state={sort} onSort={setSort} />
              <SortHeader label={t('rooms.type')} sortKey="room_type" state={sort} onSort={setSort} />
              <SortHeader label={t('rooms.capacity')} sortKey="capacity" state={sort} onSort={setSort} />
              <SortHeader label={t('rooms.availableFrom')} sortKey="available_from" state={sort} onSort={setSort} />
              <SortHeader label={t('rooms.occupants')} sortKey="occupants" state={sort} onSort={setSort} />
              <SortHeader label={t('filter.status')} sortKey="status" state={sort} onSort={setSort} />
              <SortHeader label={t('filter.use')} sortKey="is_staff" state={sort} onSort={setSort} />
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedRooms.map((room) => (
              <tr key={room.id} className="bg-card hover:bg-secondary/50 transition-colors">
                {editingId === room.id ? (
                  <>
                    <td className="px-3 py-3 w-10">
                      <Checkbox
                        checked={selectedRoomIds.has(room.id)}
                        onCheckedChange={() => toggleSelectedRoom(room.id)}
                        aria-label={`Select room ${room.room_number}`}
                      />
                    </td>
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
                          {editForm.is_staff ? t('use.staff') : t('use.guest')}
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
                    <td className="px-3 py-3 w-10">
                      <Checkbox
                        checked={selectedRoomIds.has(room.id)}
                        onCheckedChange={() => toggleSelectedRoom(room.id)}
                        aria-label={`Select room ${room.room_number}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => setDetailRoom(room)}
                        className="text-foreground hover:text-primary underline-offset-2 hover:underline"
                      >
                        {room.room_number}
                      </button>
                    </td>
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
                            <span className="text-foreground truncate max-w-[220px]" title={names}>
                              {occ.map((g, i) => (
                                <span key={g.id}>
                                  {i > 0 && ', '}
                                  <button
                                    type="button"
                                    onClick={() => onOpenGuest?.(g.id)}
                                    className="hover:text-primary underline-offset-2 hover:underline"
                                  >
                                    {g.full_name}
                                  </button>
                                </span>
                              ))}
                            </span>
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
                          room.status === 'maintenance' || room.status === 'cleaning' || room.status === 'blocked'
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
                          {room.is_staff ? t('use.staff') : t('use.guest')}
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
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  No rooms found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RoomDetailDialog
        room={detailRoom}
        rooms={rooms}
        guests={guests}
        bookings={bookings}
        open={detailRoom !== null}
        onOpenChange={(o) => { if (!o) setDetailRoom(null) }}
        onChanged={fetchRooms}
        onOpenGuest={(id) => {
          setDetailRoom(null)
          onOpenGuest?.(id)
        }}
      />
    </div>
  )
}
