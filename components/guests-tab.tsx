'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Guest, Room, Booking, TRIBES, Tribe } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Pencil, Trash2, X, Check, BedDouble, EyeOff, Download, Upload } from 'lucide-react'
import { generateCSV, downloadCSV, csvToObjects } from '@/lib/csv'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { AssignRoomDialog } from '@/components/assign-room-dialog'
import { GuestDetailDialog } from '@/components/guest-detail-dialog'
import { GuestEditDialog } from '@/components/guest-edit-dialog'
import { SortHeader, compareBy, SortState } from '@/components/sort-header'
import { useT } from '@/lib/i18n'

type GuestSortKey =
  | 'order_code'
  | 'full_name'
  | 'role'
  | 'country'
  | 'hotel'
  | 'room'
  | 'room_type'
  | 'tribe'
  | 'ticket_type'
  | 'check_in_date'
  | 'check_out_date'

const tribeColors: Record<string, string> = {
  'Root Tribe': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Lens Tribe': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  'Beat Tribe': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'Sunset Tribe': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Fresh Tribe': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'Pulse Tribe': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'Spin Tribe': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Core Tribe': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

const roomTypeLabels: Record<string, string> = {
  single: 'Single',
  double: 'Double',
  triple: 'Triple',
  quadruple: 'Quadruple',
}
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
import { format } from 'date-fns'

const roles = ['Leader', 'Follower', 'Both'] as const
const ticketTypes = [
  'CORE TRIBE',
  'RAVEPASS',
  'RAVEPASS EXTENSION',
  'SINGLE ROOM 3 NIGHTS',
  'SINGLE ROOM 4 NIGHTS',
  'DOUBLE ROOM 3 NIGHTS',
  'DOUBLE ROOM 4 NIGHTS',
  'TRIPLE ROOM 3 NIGHTS',
  'TRIPLE ROOM 4 NIGHTS',
  'UPGRADED SINGLE ROOM 3 NIGHTS',
  'UPGRADED SINGLE ROOM 4 NIGHTS',
  'UPGRADED DOUBLE ROOM 3 NIGHTS',
  'UPGRADED DOUBLE ROOM 4 NIGHTS',
] as const

const roleColors: Record<string, string> = {
  Leader: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Follower: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  Both: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

const hotelColors: Record<string, string> = {
  H3: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  H4: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

interface GuestsTabProps {
  openGuestId?: string | null
  onOpenGuestHandled?: () => void
  onOpenGuest?: (id: string) => void
}

export function GuestsTab({ openGuestId, onOpenGuestHandled, onOpenGuest }: GuestsTabProps = {}) {
  const t = useT()
  const [guests, setGuests] = useState<Guest[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Guest>>({})
  const [editDialogGuest, setEditDialogGuest] = useState<Guest | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [assignGuest, setAssignGuest] = useState<Guest | null>(null)
  const [detailGuest, setDetailGuest] = useState<Guest | null>(null)
  const [sort, setSort] = useState<SortState<GuestSortKey>>({ key: 'order_code', dir: 'asc' })
  // Column filters. 'all' = no filter applied for that column.
  const [hotelFilter, setHotelFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [countryFilter, setCountryFilter] = useState<string>('all')
  const [ticketFilter, setTicketFilter] = useState<string>('all')
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>('all')
  const [assignFilter, setAssignFilter] = useState<string>('all') // all | assigned | unassigned
  const [newGuest, setNewGuest] = useState({
    order_code: '',
    full_name: '',
    role: 'Follower' as Guest['role'],
    country: '',
    ticket_type: 'RAVEPASS',
    check_in_date: null as string | null,
    check_out_date: null as string | null,
    tribe: null as Tribe | null,
  })
  const [tribeFilter, setTribeFilter] = useState<string>('all')
  const [hiddenTickets, setHiddenTickets] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkPatch, setBulkPatch] = useState<Partial<Guest>>({})

  const supabase = createClient()

  const fetchAll = useCallback(async () => {
    const [g, r, b] = await Promise.all([
      supabase.from('guests').select('*').order('order_code', { ascending: true }),
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

  // External nav hook: when openGuestId is set, open that guest's detail dialog
  // and notify the caller so they can clear the request.
  useEffect(() => {
    if (!openGuestId) return
    const g = guests.find((x) => x.id === openGuestId)
    if (g) {
      setDetailGuest(g)
      onOpenGuestHandled?.()
    }
  }, [openGuestId, guests, onOpenGuestHandled])

  // Lookup: guest_id -> assigned room_number + room_type (via active booking).
  // Must be declared BEFORE filteredGuests — the filter callback uses both.
  const roomByGuestId = new Map<string, string>()
  const roomTypeByGuestId = new Map<string, Room['room_type']>()
  for (const b of bookings) {
    if (b.status === 'cancelled') continue
    const room = rooms.find((r) => r.id === b.room_id)
    if (room) {
      roomByGuestId.set(b.guest_id, room.room_number)
      roomTypeByGuestId.set(b.guest_id, room.room_type)
    }
  }

  const filteredGuests = guests.filter((guest) => {
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      !q ||
      guest.full_name.toLowerCase().includes(q) ||
      guest.order_code.toLowerCase().includes(q) ||
      guest.country?.toLowerCase().includes(q) ||
      guest.ticket_type.toLowerCase().includes(q)
    const matchesHotel =
      hotelFilter === 'all' ||
      (hotelFilter === 'none' ? guest.hotel === null : guest.hotel === hotelFilter)
    const matchesRole = roleFilter === 'all' || guest.role === roleFilter
    const matchesCountry = countryFilter === 'all' || guest.country === countryFilter
    const matchesTicket =
      (ticketFilter === 'all' || guest.ticket_type === ticketFilter) &&
      !hiddenTickets.has(guest.ticket_type)
    const matchesRoomType = (() => {
      if (roomTypeFilter === 'all') return true
      if (roomTypeFilter === 'unassigned') return !roomByGuestId.has(guest.id)
      return roomTypeByGuestId.get(guest.id) === roomTypeFilter
    })()
    const matchesAssign =
      assignFilter === 'all' ||
      (assignFilter === 'assigned' ? roomByGuestId.has(guest.id) : !roomByGuestId.has(guest.id))
    const matchesTribe =
      tribeFilter === 'all' ||
      (tribeFilter === 'none' ? !guest.tribe : guest.tribe === tribeFilter)
    return (
      matchesSearch &&
      matchesHotel &&
      matchesRole &&
      matchesCountry &&
      matchesTicket &&
      matchesRoomType &&
      matchesAssign &&
      matchesTribe
    )
  })

  // Options for filter dropdowns (derived from current data)
  const countryOptions = Array.from(new Set(guests.map((g) => g.country).filter(Boolean))).sort() as string[]
  const ticketOptions = Array.from(new Set(guests.map((g) => g.ticket_type))).sort()

  // Apply sort to the filtered list
  const sortedGuests = [...filteredGuests].sort(
    compareBy((g) => {
      switch (sort.key) {
        case 'room':
          const rn = roomByGuestId.get(g.id)
          return rn ? Number(rn) : null
        case 'room_type':
          return roomTypeByGuestId.get(g.id) ?? null
        case 'tribe':
          return g.tribe ?? null
        default:
          return (g as Record<string, unknown>)[sort.key] as string | number | null
      }
    }, sort.dir),
  )

  const handleAddGuest = async () => {
    if (!newGuest.order_code || !newGuest.full_name) return
    const { error } = await supabase.from('guests').insert([newGuest])
    if (!error) {
      fetchAll()
      setIsAddDialogOpen(false)
      setNewGuest({
        order_code: '',
        full_name: '',
        role: 'Follower',
        country: '',
        ticket_type: 'RAVEPASS',
        check_in_date: null,
        check_out_date: null,
        tribe: null,
      })
    }
  }

  const handleUpdateGuest = async (id: string) => {
    const { error } = await supabase.from('guests').update(editForm).eq('id', id)
    if (!error) {
      // Keep the booking in sync — the stats/availability charts read dates from there.
      const bookingPatch: { check_in_date?: string; check_out_date?: string } = {}
      if (editForm.check_in_date !== undefined && editForm.check_in_date !== null) bookingPatch.check_in_date = editForm.check_in_date
      if (editForm.check_out_date !== undefined && editForm.check_out_date !== null) bookingPatch.check_out_date = editForm.check_out_date
      if (Object.keys(bookingPatch).length > 0) {
        await supabase.from('bookings').update(bookingPatch).eq('guest_id', id).neq('status', 'cancelled')
      }
      fetchAll()
      setEditingId(null)
      setEditForm({})
    }
  }

  const handleDeleteGuest = async (id: string) => {
    const guest = guests.find((g) => g.id === id)
    const label = guest ? `${guest.full_name} (order ${guest.order_code})` : 'this guest'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    const { error } = await supabase.from('guests').delete().eq('id', id)
    if (!error) fetchAll()
  }

  const startEditing = (guest: Guest) => {
    // Open the responsive modal — easier to use on mobile than the inline-table edit.
    setEditDialogGuest(guest)
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allVisibleSelected =
    sortedGuests.length > 0 && sortedGuests.every((g) => selectedIds.has(g.id))

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const g of sortedGuests) next.delete(g.id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const g of sortedGuests) next.add(g.id)
        return next
      })
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setBulkPatch({})
  }

  const applyBulkPatch = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const patch = { ...bulkPatch }
    if (Object.keys(patch).length === 0) return
    const { error } = await supabase.from('guests').update(patch).in('id', ids)
    if (!error) {
      const bookingPatch: { check_in_date?: string; check_out_date?: string } = {}
      if (patch.check_in_date) bookingPatch.check_in_date = patch.check_in_date
      if (patch.check_out_date) bookingPatch.check_out_date = patch.check_out_date
      if (Object.keys(bookingPatch).length > 0) {
        await supabase.from('bookings').update(bookingPatch).in('guest_id', ids).neq('status', 'cancelled')
      }
      await fetchAll()
      clearSelection()
    }
  }

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} guest(s)? This cannot be undone.`)) return
    const { error } = await supabase.from('guests').delete().in('id', ids)
    if (!error) {
      await fetchAll()
      clearSelection()
    }
  }

  const handleExportGuestsCSV = () => {
    const headers = ['order_code', 'full_name', 'role', 'country', 'ticket_type', 'hotel', 'tribe', 'check_in_date', 'check_out_date']
    const rows = sortedGuests.map((g) => [
      g.order_code,
      g.full_name,
      g.role,
      g.country ?? '',
      g.ticket_type,
      g.hotel ?? '',
      g.tribe ?? '',
      g.check_in_date ?? '',
      g.check_out_date ?? '',
    ])
    const csv = generateCSV(headers, rows)
    downloadCSV(csv, `salsarave-2026-guests-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const [importBusy, setImportBusy] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; updated: number; errors: string[] } | null>(null)

  const handleImportGuestsCSV = async (file: File) => {
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
      if (!first['order_code'] || !first['full_name']) {
        setImportResult({ added: 0, updated: 0, errors: ['CSV must have order_code and full_name columns'] })
        return
      }

      let added = 0
      let updated = 0
      const errors: string[] = []

      for (const rec of records) {
        const guestData: Record<string, unknown> = {
          order_code: rec['order_code'],
          full_name: rec['full_name'],
          role: (['Leader', 'Follower', 'Both'].includes(rec['role']) ? rec['role'] : 'Follower'),
          country: rec['country'] || null,
          ticket_type: rec['ticket_type'] || 'RAVEPASS',
          hotel: (['H3', 'H4'].includes(rec['hotel']) ? rec['hotel'] : null),
          tribe: (TRIBES as readonly string[]).includes(rec['tribe']) ? rec['tribe'] : null,
        }
        if (rec['check_in_date']) guestData.check_in_date = rec['check_in_date']
        if (rec['check_out_date']) guestData.check_out_date = rec['check_out_date']

        const existing = guests.find(
          (g) => g.order_code === rec['order_code'] && g.full_name === rec['full_name'],
        )

        if (existing) {
          const { error } = await supabase.from('guests').update(guestData).eq('id', existing.id)
          if (error) errors.push(`Update failed for ${rec['full_name']}: ${error.message}`)
          else updated++
        } else {
          const { error } = await supabase.from('guests').insert([guestData])
          if (error) errors.push(`Insert failed for ${rec['full_name']}: ${error.message}`)
          else added++
        }
      }

      setImportResult({ added, updated, errors })
      await fetchAll()
    } catch (err) {
      setImportResult({ added: 0, updated: 0, errors: [`Parse error: ${(err as Error).message}`] })
    } finally {
      setImportBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-primary" />
      </div>
    )
  }

  const anyFilter =
    hotelFilter !== 'all' ||
    roleFilter !== 'all' ||
    countryFilter !== 'all' ||
    ticketFilter !== 'all' ||
    roomTypeFilter !== 'all' ||
    assignFilter !== 'all' ||
    tribeFilter !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t('guests.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap w-full sm:w-auto justify-between">
          <span className="text-sm text-muted-foreground mr-auto sm:mr-0">{t('guests.count', { n: sortedGuests.length, total: guests.length })}</span>
          <Button variant="outline" className="gap-2" onClick={handleExportGuestsCSV}>
            <Download className="size-4" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">CSV↓</span>
          </Button>
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
                if (file) handleImportGuestsCSV(file)
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
                {t('guests.add')}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">{t('guests.addNew')}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder={`${t('guests.orderCode')} *`}
                    value={newGuest.order_code}
                    onChange={(e) => setNewGuest({ ...newGuest, order_code: e.target.value })}
                    className="bg-secondary border-border"
                  />
                  <Input
                    placeholder={`${t('guests.fullName')} *`}
                    value={newGuest.full_name}
                    onChange={(e) => setNewGuest({ ...newGuest, full_name: e.target.value })}
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    value={newGuest.role}
                    onValueChange={(value: Guest['role']) => setNewGuest({ ...newGuest, role: value })}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder={t('guests.role')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {roles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`role.${role}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={t('guests.country')}
                    value={newGuest.country || ''}
                    onChange={(e) => setNewGuest({ ...newGuest, country: e.target.value })}
                    className="bg-secondary border-border"
                  />
                </div>
                <Select
                  value={newGuest.ticket_type}
                  onValueChange={(value) => {
                    let checkIn = null
                    let checkOut = null
                    if (value.includes('4 NIGHTS')) {
                      checkIn = '2026-09-10'
                      checkOut = '2026-09-14'
                    } else if (value.includes('3 NIGHTS')) {
                      checkIn = '2026-09-11'
                      checkOut = '2026-09-14'
                    }
                    setNewGuest({ ...newGuest, ticket_type: value, check_in_date: checkIn, check_out_date: checkOut })
                  }}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder={t('guests.ticketType')} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {ticketTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={newGuest.tribe ?? 'none'}
                  onValueChange={(v) => setNewGuest({ ...newGuest, tribe: v === 'none' ? null : (v as Tribe) })}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder={t('filter.tribe')} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none">{t('filter.noTribe')}</SelectItem>
                    {TRIBES.map((tr) => <SelectItem key={tr} value={tr}>{tr}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddGuest} className="w-full">
                  {t('guests.add')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter bar — grid on mobile, inline on desktop */}
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:flex-wrap bg-secondary/20 border border-border rounded-md p-2">
        <Select value={hotelFilter} onValueChange={setHotelFilter}>
          <SelectTrigger className="w-full sm:w-32 h-8 text-sm bg-card border-border"><SelectValue placeholder={t('filter.hotel')} /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">{t('filter.allHotels')}</SelectItem>
            <SelectItem value="H3">H3</SelectItem>
            <SelectItem value="H4">H4</SelectItem>
            <SelectItem value="none">{t('filter.noHotel')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-32 h-8 text-sm bg-card border-border"><SelectValue placeholder={t('filter.role')} /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">{t('filter.allRoles')}</SelectItem>
            {roles.map((r) => <SelectItem key={r} value={r}>{t(`role.${r}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="w-full sm:w-40 h-8 text-sm bg-card border-border"><SelectValue placeholder={t('filter.country')} /></SelectTrigger>
          <SelectContent className="bg-card border-border max-h-72">
            <SelectItem value="all">{t('filter.allCountries')}</SelectItem>
            {countryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ticketFilter} onValueChange={setTicketFilter}>
          <SelectTrigger className="w-full sm:w-44 h-8 text-sm bg-card border-border"><SelectValue placeholder={t('filter.ticket')} /></SelectTrigger>
          <SelectContent className="bg-card border-border max-h-72">
            <SelectItem value="all">{t('filter.allTickets')}</SelectItem>
            {ticketOptions.map((tk) => <SelectItem key={tk} value={tk}>{tk}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
          <SelectTrigger className="w-full sm:w-36 h-8 text-sm bg-card border-border"><SelectValue placeholder={t('filter.roomType')} /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">{t('filter.allRoomTypes')}</SelectItem>
            <SelectItem value="single">{t('type.single')}</SelectItem>
            <SelectItem value="double">{t('type.double')}</SelectItem>
            <SelectItem value="triple">{t('type.triple')}</SelectItem>
            <SelectItem value="quadruple">{t('type.quadruple')}</SelectItem>
            <SelectItem value="unassigned">{t('common.unassigned')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assignFilter} onValueChange={setAssignFilter}>
          <SelectTrigger className="w-full sm:w-36 h-8 text-sm bg-card border-border"><SelectValue placeholder={t('filter.assignment')} /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="assigned">{t('common.assigned')}</SelectItem>
            <SelectItem value="unassigned">{t('common.unassigned')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tribeFilter} onValueChange={setTribeFilter}>
          <SelectTrigger className="w-full sm:w-36 h-8 text-sm bg-card border-border"><SelectValue placeholder={t('filter.tribe')} /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">{t('filter.allTribes')}</SelectItem>
            <SelectItem value="none">{t('filter.noTribe')}</SelectItem>
            {TRIBES.map((tr) => <SelectItem key={tr} value={tr}>{tr}</SelectItem>)}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 bg-card border-border">
              <EyeOff className="size-3" />
              <span className="text-sm">
                Hide tickets{hiddenTickets.size > 0 ? ` (${hiddenTickets.size})` : ''}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 bg-card border-border" align="start">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Hide ticket types
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {ticketOptions.map((tk) => (
                <label key={tk} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-secondary/50 rounded px-1 py-1">
                  <Checkbox
                    checked={hiddenTickets.has(tk)}
                    onCheckedChange={(v) => {
                      setHiddenTickets((prev) => {
                        const next = new Set(prev)
                        if (v) next.add(tk)
                        else next.delete(tk)
                        return next
                      })
                    }}
                  />
                  <span className="truncate">{tk}</span>
                </label>
              ))}
            </div>
            {hiddenTickets.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 w-full text-xs text-muted-foreground"
                onClick={() => setHiddenTickets(new Set())}
              >
                Clear hidden
              </Button>
            )}
          </PopoverContent>
        </Popover>
        {(anyFilter || hiddenTickets.size > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setHotelFilter('all')
              setRoleFilter('all')
              setCountryFilter('all')
              setTicketFilter('all')
              setRoomTypeFilter('all')
              setAssignFilter('all')
              setTribeFilter('all')
              setHiddenTickets(new Set())
            }}
          >
            <X className="size-3 mr-1" />
            {t('common.clear')}
          </Button>
        )}
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

      {/* Bulk edit toolbar — visible when one or more guests are selected */}
      {selectedIds.size > 0 && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                <X className="size-4 mr-1" />Clear
              </Button>
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={deleteSelected}>
                <Trash2 className="size-4 mr-1" />Delete selected
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Hotel</span>
              <Select
                value={bulkPatch.hotel ?? '__skip__'}
                onValueChange={(v) =>
                  setBulkPatch({
                    ...bulkPatch,
                    hotel: v === '__skip__' ? undefined : v === 'none' ? null : (v as 'H3' | 'H4'),
                  })
                }
              >
                <SelectTrigger className="h-8 w-28 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__skip__">— skip —</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="H3">H3</SelectItem>
                  <SelectItem value="H4">H4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Role</span>
              <Select
                value={(bulkPatch.role as string) ?? '__skip__'}
                onValueChange={(v) =>
                  setBulkPatch({ ...bulkPatch, role: v === '__skip__' ? undefined : (v as Guest['role']) })
                }
              >
                <SelectTrigger className="h-8 w-28 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__skip__">— skip —</SelectItem>
                  {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Tribe</span>
              <Select
                value={
                  bulkPatch.tribe === undefined ? '__skip__' : bulkPatch.tribe === null ? 'none' : bulkPatch.tribe
                }
                onValueChange={(v) =>
                  setBulkPatch({
                    ...bulkPatch,
                    tribe: v === '__skip__' ? undefined : v === 'none' ? null : (v as Tribe),
                  })
                }
              >
                <SelectTrigger className="h-8 w-32 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__skip__">— skip —</SelectItem>
                  <SelectItem value="none">No tribe</SelectItem>
                  {TRIBES.map((tr) => <SelectItem key={tr} value={tr}>{tr}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Ticket</span>
              <Select
                value={(bulkPatch.ticket_type as string) ?? '__skip__'}
                onValueChange={(v) =>
                  setBulkPatch({ ...bulkPatch, ticket_type: v === '__skip__' ? undefined : v })
                }
              >
                <SelectTrigger className="h-8 w-44 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border max-h-72">
                  <SelectItem value="__skip__">— skip —</SelectItem>
                  {ticketTypes.map((tk) => <SelectItem key={tk} value={tk}>{tk}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Check-in</span>
              <Input
                type="date"
                value={bulkPatch.check_in_date ?? ''}
                onChange={(e) =>
                  setBulkPatch({ ...bulkPatch, check_in_date: e.target.value || undefined })
                }
                className="h-8 w-36 text-sm bg-card border-border"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Check-out</span>
              <Input
                type="date"
                value={bulkPatch.check_out_date ?? ''}
                onChange={(e) =>
                  setBulkPatch({ ...bulkPatch, check_out_date: e.target.value || undefined })
                }
                className="h-8 w-36 text-sm bg-card border-border"
              />
            </div>
            <Button size="sm" onClick={applyBulkPatch} disabled={Object.keys(bulkPatch).length === 0}>
              <Check className="size-4 mr-1" />Apply to {selectedIds.size}
            </Button>
          </div>
        </div>
      )}

      {/* Mobile card list (visible under md) */}
      <div className="md:hidden space-y-2">
        {sortedGuests.map((guest) => {
          const roomNum = roomByGuestId.get(guest.id)
          const roomType = roomTypeByGuestId.get(guest.id)
          return (
            <div
              key={guest.id}
              className="rounded-lg border border-border bg-card p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => setDetailGuest(guest)}
                    className="font-medium text-foreground hover:text-primary text-left break-words"
                  >
                    {guest.full_name}
                  </button>
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">
                    {guest.order_code}
                    {guest.country ? ` · ${guest.country}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    onClick={() => startEditing(guest)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteGuest(guest.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className={`inline-flex px-2 py-0.5 rounded-md border font-medium ${roleColors[guest.role]}`}>
                  {t(`role.${guest.role}`)}
                </span>
                {guest.hotel && (
                  <span className={`inline-flex px-2 py-0.5 rounded-md border font-medium ${hotelColors[guest.hotel]}`}>
                    {guest.hotel}
                  </span>
                )}
                {guest.hotel && guest.check_in_date && (
                  <button
                    onClick={() => setAssignGuest(guest)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${
                      roomNum
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        : 'bg-secondary text-muted-foreground border-border'
                    }`}
                  >
                    <BedDouble className="size-3" />
                    <span className="font-mono">{roomNum ?? t('guests.assign')}</span>
                    {roomType && <span className="opacity-70">· {roomTypeLabels[roomType]}</span>}
                  </button>
                )}
                {guest.tribe && (
                  <span className={`inline-flex px-2 py-0.5 rounded-md border font-medium ${tribeColors[guest.tribe] ?? 'bg-secondary border-border text-muted-foreground'}`}>
                    {guest.tribe}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {guest.ticket_type}
                {guest.check_in_date && guest.check_out_date && (
                  <> · {format(new Date(guest.check_in_date), 'MMM d')} → {format(new Date(guest.check_out_date), 'MMM d')}</>
                )}
              </div>
            </div>
          )
        })}
        {sortedGuests.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {t('guests.notFound')}
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-3 w-9">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAllVisible}
                  aria-label="Select all"
                />
              </th>
              <SortHeader label={t('guests.order')} sortKey="order_code" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.name')} sortKey="full_name" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.role')} sortKey="role" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.country')} sortKey="country" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.hotel')} sortKey="hotel" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.room')} sortKey="room" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.roomType')} sortKey="room_type" state={sort} onSort={setSort} />
              <SortHeader label={t('filter.tribe')} sortKey="tribe" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.ticketType')} sortKey="ticket_type" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.checkIn')} sortKey="check_in_date" state={sort} onSort={setSort} />
              <SortHeader label={t('guests.checkOut')} sortKey="check_out_date" state={sort} onSort={setSort} />
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedGuests.map((guest) => (
              <tr key={guest.id} className={`hover:bg-secondary/50 transition-colors ${selectedIds.has(guest.id) ? 'bg-primary/10' : 'bg-card'}`}>
                <td className="px-3 py-3 w-9">
                  <Checkbox
                    checked={selectedIds.has(guest.id)}
                    onCheckedChange={() => toggleSelected(guest.id)}
                    aria-label="Select row"
                  />
                </td>
                {editingId === guest.id ? (
                  <>
                    <td className="px-4 py-3">
                      <Input
                        value={editForm.order_code || ''}
                        onChange={(e) => setEditForm({ ...editForm, order_code: e.target.value })}
                        className="h-8 w-24 text-sm bg-secondary border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={editForm.full_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                        className="h-8 text-sm bg-secondary border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={editForm.role}
                        onValueChange={(value: Guest['role']) => setEditForm({ ...editForm, role: value })}
                      >
                        <SelectTrigger className="h-8 w-24 text-sm bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {roles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(`role.${role}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={editForm.country || ''}
                        onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                        className="h-8 w-28 text-sm bg-secondary border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={editForm.hotel ?? 'none'}
                        onValueChange={(v) => setEditForm({ ...editForm, hotel: v === 'none' ? null : (v as 'H3' | 'H4') })}
                      >
                        <SelectTrigger className="h-8 w-20 text-sm bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="none">—</SelectItem>
                          <SelectItem value="H3">H3</SelectItem>
                          <SelectItem value="H4">H4</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setAssignGuest(guest)}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium bg-secondary text-foreground border-border hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        <BedDouble className="size-3" />
                        <span className="font-mono">{roomByGuestId.get(guest.id) ?? t('guests.assign')}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(() => {
                        const rt = roomTypeByGuestId.get(guest.id)
                        return rt ? <span className="text-muted-foreground">{roomTypeLabels[rt]}</span> : <span className="text-muted-foreground">—</span>
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={editForm.tribe ?? 'none'}
                        onValueChange={(v) => setEditForm({ ...editForm, tribe: v === 'none' ? null : (v as Tribe) })}
                      >
                        <SelectTrigger className="h-8 w-36 text-sm bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="none">{t('filter.noTribe')}</SelectItem>
                          {TRIBES.map((tr) => <SelectItem key={tr} value={tr}>{tr}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={editForm.ticket_type}
                        onValueChange={(value) => setEditForm({ ...editForm, ticket_type: value })}
                      >
                        <SelectTrigger className="h-8 w-40 text-sm bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {ticketTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="date"
                        value={editForm.check_in_date ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, check_in_date: e.target.value || null })}
                        className="h-8 w-36 text-sm bg-secondary border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="date"
                        value={editForm.check_out_date ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, check_out_date: e.target.value || null })}
                        className="h-8 w-36 text-sm bg-secondary border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-primary hover:text-primary"
                          onClick={() => handleUpdateGuest(guest.id)}
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
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{guest.order_code}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setDetailGuest(guest)}
                        className="font-medium text-foreground hover:text-primary hover:underline transition-colors text-left"
                      >
                        {guest.full_name}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md border ${roleColors[guest.role]}`}>
                        {t(`role.${guest.role}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{guest.country || '-'}</td>
                    <td className="px-4 py-3">
                      {guest.hotel ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md border ${hotelColors[guest.hotel]}`}>
                          {guest.hotel === 'H4' ? 'H4 (Upgraded)' : 'H3 (Standard)'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setAssignGuest(guest)}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          roomByGuestId.has(guest.id)
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
                            : 'bg-secondary text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                        }`}
                      >
                        <BedDouble className="size-3" />
                        <span className="font-mono">{roomByGuestId.get(guest.id) ?? t('guests.assign')}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(() => {
                        const rt = roomTypeByGuestId.get(guest.id)
                        return rt
                          ? <span className="text-muted-foreground">{roomTypeLabels[rt]}</span>
                          : <span className="text-muted-foreground">—</span>
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {guest.tribe ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md border ${tribeColors[guest.tribe] ?? 'bg-secondary border-border text-muted-foreground'}`}>
                          {guest.tribe}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{guest.ticket_type}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {guest.check_in_date ? format(new Date(guest.check_in_date), 'MMM d') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {guest.check_out_date ? format(new Date(guest.check_out_date), 'MMM d') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditing(guest)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteGuest(guest.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {sortedGuests.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                  {t('guests.notFound')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AssignRoomDialog
        guest={assignGuest}
        rooms={rooms}
        bookings={bookings}
        open={assignGuest !== null}
        onOpenChange={(open) => !open && setAssignGuest(null)}
        onChanged={fetchAll}
      />

      <GuestDetailDialog
        guest={detailGuest}
        rooms={rooms}
        guests={guests}
        bookings={bookings}
        open={detailGuest !== null}
        onOpenChange={(open) => !open && setDetailGuest(null)}
        onChanged={fetchAll}
        onRequestChangeRoom={(g) => setAssignGuest(g)}
        onOpenGuest={(id) => {
          const g = guests.find((x) => x.id === id)
          if (g) setDetailGuest(g)
          else {
            setDetailGuest(null)
            onOpenGuest?.(id)
          }
        }}
      />

      <GuestEditDialog
        guest={editDialogGuest}
        open={editDialogGuest !== null}
        onOpenChange={(open) => !open && setEditDialogGuest(null)}
        onSaved={fetchAll}
      />
    </div>
  )
}
