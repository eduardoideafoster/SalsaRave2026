'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Guest, Room } from '@/lib/types'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, PlusCircle, MinusCircle, PencilLine } from 'lucide-react'
import { format, parseISO } from 'date-fns'

interface AuditRow {
  id: number
  changed_at: string
  table_name: 'guests' | 'rooms' | 'bookings'
  row_id: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  changed_fields: string[] | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  actor: string | null
}

// Fields nobody needs to read about, and friendly names for the rest.
const HIDDEN = new Set(['id', 'created_at', 'updated_at', 'guest_id', 'room_id'])
const LABEL: Record<string, string> = {
  check_in_date: 'entrada',
  check_out_date: 'salida',
  room_type: 'tipo',
  available_from: 'disponible desde',
  is_staff: 'staff',
  requested: 'solicitada',
  full_name: 'nombre',
  ticket_type: 'ticket',
  order_code: 'pedido',
  room_number: 'nº habitación',
  status: 'estado',
  capacity: 'capacidad',
  notes: 'notas',
  hotel: 'hotel',
  country: 'país',
  role: 'rol',
  tribe: 'tribu',
}

const fmtValue = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  const s = String(v)
  // Dates read better as day and month.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try { return format(parseISO(s), 'd MMM') } catch { return s }
  }
  return s
}

export function ChangesTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<AuditRow[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(200)

  const fetchAll = useCallback(async () => {
    const [a, g, r] = await Promise.all([
      supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(limit),
      supabase.from('guests').select('id, full_name'),
      supabase.from('rooms').select('id, room_number, hotel'),
    ])
    if (a.data) setRows(a.data as AuditRow[])
    if (g.data) setGuests(g.data as Guest[])
    if (r.data) setRooms(r.data as Room[])
    setLoading(false)
  }, [supabase, limit])

  useEffect(() => { fetchAll() }, [fetchAll])

  const guestName = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of guests) m.set(g.id, g.full_name)
    return m
  }, [guests])

  const roomName = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rooms) m.set(r.id, `${r.hotel} ${r.room_number}`)
    return m
  }, [rooms])

  /** Who or what the change was about, in words. */
  const subjectOf = (row: AuditRow): string => {
    const data = (row.new_data ?? row.old_data ?? {}) as Record<string, unknown>
    if (row.table_name === 'guests') return String(data.full_name ?? 'huésped')
    if (row.table_name === 'rooms') return `Habitación ${data.hotel ?? ''} ${data.room_number ?? ''}`.trim()
    // A booking is a person in a room; both live in other tables.
    const who = guestName.get(String(data.guest_id)) ?? 'huésped'
    const where = roomName.get(String(data.room_id)) ?? 'habitación'
    return `${who} · ${where}`
  }

  const verbOf = (row: AuditRow) => {
    if (row.table_name === 'bookings') {
      return row.action === 'INSERT' ? 'asignado a' : row.action === 'DELETE' ? 'sacado de' : 'cambio en'
    }
    return row.action === 'INSERT' ? 'añadido' : row.action === 'DELETE' ? 'eliminado' : 'modificado'
  }

  const visible = rows.filter((r) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return subjectOf(r).toLowerCase().includes(q) || r.table_name.includes(q)
  })

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Spinner className="size-8 text-primary" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o habitación…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary border-border"
          />
        </div>
        <span className="text-sm text-muted-foreground">{visible.length} cambios</span>
      </div>

      {rows.length === 0 && (
        <div className="bg-card rounded-lg border border-border p-6 text-sm text-muted-foreground">
          Todavía no hay cambios registrados. El historial empezó el 7 de septiembre de 2026:
          lo anterior a esa fecha no quedó guardado en ningún sitio.
        </div>
      )}

      <div className="space-y-2">
        {visible.map((row) => {
          const fields = (row.changed_fields ?? []).filter((f) => !HIDDEN.has(f))
          const icon =
            row.action === 'INSERT' ? <PlusCircle className="size-4 text-emerald-400" />
            : row.action === 'DELETE' ? <MinusCircle className="size-4 text-red-400" />
            : <PencilLine className="size-4 text-blue-400" />
          return (
            <div key={row.id} className="bg-card rounded-lg border border-border px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-medium text-foreground">{subjectOf(row)}</span>
                    <span className="text-sm text-muted-foreground">{verbOf(row)}</span>
                    <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                      {format(new Date(row.changed_at), 'd MMM · HH:mm')}
                    </span>
                  </div>

                  {row.action === 'UPDATE' && fields.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {fields.map((f) => (
                        <span key={f} className="text-muted-foreground">
                          {LABEL[f] ?? f}:{' '}
                          <span className="text-red-300/80 line-through">
                            {fmtValue(row.old_data?.[f])}
                          </span>
                          {' → '}
                          <span className="text-emerald-300">{fmtValue(row.new_data?.[f])}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {row.action === 'DELETE' && row.table_name !== 'bookings' && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Los datos quedan guardados y se pueden recuperar.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {rows.length >= limit && (
        <Button variant="outline" onClick={() => setLimit((n) => n + 200)} className="w-full">
          Ver más
        </Button>
      )}
    </div>
  )
}
