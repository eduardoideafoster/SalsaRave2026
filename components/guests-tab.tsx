'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Guest, Room, Booking } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Pencil, Trash2, X, Check, BedDouble } from 'lucide-react'
import { AssignRoomDialog } from '@/components/assign-room-dialog'
import { GuestDetailDialog } from '@/components/guest-detail-dialog'
import { SortHeader, compareBy, SortState } from '@/components/sort-header'

type GuestSortKey =
  | 'order_code'
  | 'full_name'
  | 'role'
  | 'country'
  | 'hotel'
  | 'room'
  | 'ticket_type'
  | 'check_in_date'
  | 'check_out_date'
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
  const [newGuest, setNewGuest] = useState({
    order_code: '',
    full_name: '',
    role: 'Follower' as Guest['role'],
    country: '',
    ticket_type: 'RAVEPASS',
    check_in_date: null as string | null,
    check_out_date: null as string | null,
  })

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

  const filteredGuests = guests.filter(
    (guest) =>
      guest.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.order_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.ticket_type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Lookup: guest_id -> assigned room_number (via active booking)
  const roomByGuestId = new Map<string, string>()
  for (const b of bookings) {
    if (b.status === 'cancelled') continue
    const room = rooms.find((r) => r.id === b.room_id)
    if (room) roomByGuestId.set(b.guest_id, room.room_number)
  }

  // Apply sort to the filtered list
  const sortedGuests = [...filteredGuests].sort(
    compareBy((g) => {
      switch (sort.key) {
        case 'room':
          const rn = roomByGuestId.get(g.id)
          // Sort by numeric room# when available so 101 < 102 < ... < 638
          return rn ? Number(rn) : null
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, order, country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{sortedGuests.length} guests</span>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                Add Guest
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Add New Guest</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="Order Code *"
                    value={newGuest.order_code}
                    onChange={(e) => setNewGuest({ ...newGuest, order_code: e.target.value })}
                    className="bg-secondary border-border"
                  />
                  <Input
                    placeholder="Full Name *"
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
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {roles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Country"
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
                    <SelectValue placeholder="Ticket Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {ticketTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddGuest} className="w-full">
                  Add Guest
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
              <SortHeader label="Order" sortKey="order_code" state={sort} onSort={setSort} />
              <SortHeader label="Name" sortKey="full_name" state={sort} onSort={setSort} />
              <SortHeader label="Role" sortKey="role" state={sort} onSort={setSort} />
              <SortHeader label="Country" sortKey="country" state={sort} onSort={setSort} />
              <SortHeader label="Hotel" sortKey="hotel" state={sort} onSort={setSort} />
              <SortHeader label="Room" sortKey="room" state={sort} onSort={setSort} />
              <SortHeader label="Ticket Type" sortKey="ticket_type" state={sort} onSort={setSort} />
              <SortHeader label="Check-in" sortKey="check_in_date" state={sort} onSort={setSort} />
              <SortHeader label="Check-out" sortKey="check_out_date" state={sort} onSort={setSort} />
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
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
                              {role}
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
                        {guest.role}
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
                          <span className="font-mono">{roomByGuestId.get(guest.id) ?? 'Assign'}</span>
                        </button>
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
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  No guests found
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
