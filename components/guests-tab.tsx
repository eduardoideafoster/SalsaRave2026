'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Guest, Room, Booking, TRIBES, Tribe } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Pencil, Trash2, X, Check, BedDouble } from 'lucide-react'
import { AssignRoomDialog } from '@/components/assign-room-dialog'
import { GuestDetailDialog } from '@/components/guest-detail-dialog'
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
  'RAVEPASS',
  'SINGLE ROOM 3 NIGHTS',
  'SINGLE ROOM 4 NIGHTS',
  'DOUBLE ROOM 3 NIGHTS',
  'DOUBLE ROOM 4 NIGHTS',
  'TRIPLE ROOM 4 NIGHTS',
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

export function GuestsTab() {
  const t = useT()
  const [guests, setGuests] = useState<Guest[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Guest>>({})
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
    const matchesTicket = ticketFilter === 'all' || guest.ticket_type === ticketFilter
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
      fetchAll()
      setEditingId(null)
      setEditForm({})
    }
  }

  const handleDeleteGuest = async (id: string) => {
    const { error } = await supabase.from('guests').delete().eq('id', id)
    if (!error) fetchAll()
  }

  const startEditing = (guest: Guest) => {
    setEditingId(guest.id)
    setEditForm(guest)
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
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between">
          <span className="text-sm text-muted-foreground">{t('guests.count', { n: sortedGuests.length, total: guests.length })}</span>
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
        {anyFilter && (
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
            }}
          >
            <X className="size-3 mr-1" />
            {t('common.clear')}
          </Button>
        )}
      </div>

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
              <tr key={guest.id} className="bg-card hover:bg-secondary/50 transition-colors">
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
                      {editForm.hotel ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md border ${hotelColors[editForm.hotel]}`}>
                          {editForm.hotel}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {roomByGuestId.get(guest.id) ?? '—'}
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
                      {guest.hotel && guest.check_in_date ? (
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
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
      />
    </div>
  )
}
