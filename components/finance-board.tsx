'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Trash2, Plus, LogOut, Upload, Globe, Pencil, Check, X } from 'lucide-react'
import { computeHotelCost, type HotelRates } from '@/lib/finance/hotel-cost'
import { useLang, useT } from '@/lib/i18n'
import { useRouter } from 'next/navigation'

interface Entry {
  id: string
  type: 'income' | 'expense'
  category: string
  description: string | null
  amount_eur: number
  date: string
  created_at: string
  scope: 'finance' | 'interno'
  paid: boolean
}

interface Payment {
  locator: number
  order_code: string
  ticket: string
  price_eur: number
}

interface BookingRow {
  room_id: string
  check_in_date: string
  check_out_date: string
}

interface RoomRow {
  id: string
  hotel: 'H3' | 'H4'
  room_type: 'single' | 'double' | 'twin' | 'matrimonial' | 'triple' | 'quadruple'
}

const CATEGORIES_INCOME = ['Tickets', 'Sponsorship', 'Other income']
const CATEGORIES_EXPENSE = [
  'Hotel',
  'Catering',
  'Production',
  'Artists',
  'Marketing',
  'Logistics',
  'Other',
]

const CATEGORY_KEY: Record<string, string> = {
  Tickets: 'finance.cat.tickets',
  Sponsorship: 'finance.cat.sponsorship',
  'Other income': 'finance.cat.otherIncome',
  Hotel: 'finance.cat.hotel',
  Catering: 'finance.cat.catering',
  Production: 'finance.cat.production',
  Artists: 'finance.cat.artists',
  Marketing: 'finance.cat.marketing',
  Logistics: 'finance.cat.logistics',
  Other: 'finance.cat.other',
}

const fmt = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

/**
 * The books for one page. /finance and /interno are the same board with
 * different numbers behind it: they share what came in from ticket sales and
 * nothing else, so the rates, the entries and the title all arrive as props.
 * Having lived as two copies of this file for an afternoon, every change had
 * to be made twice and one of them was always a paste away from drifting.
 */
export function FinanceBoard({
  scope,
  rates,
  title,
  loginPath,
  logout,
  importPaymentsXlsx,
  showTotalOutstanding = false,
}: {
  scope: 'finance' | 'interno'
  rates: HotelRates
  title: string
  loginPath: string
  logout: () => Promise<void>
  importPaymentsXlsx: (fd: FormData) => Promise<
    | { ok: true; inserted: number; updated: number; skipped: number; totalPrice: number }
    | { ok: false; error: string }
  >
  /** Only /interno shows the running total of what is still owed. */
  showTotalOutstanding?: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const t = useT()
  const { lang, setLang } = useLang()
  const tCat = (cat: string) => (CATEGORY_KEY[cat] ? t(CATEGORY_KEY[cat]) : cat)
  const [entries, setEntries] = useState<Entry[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [guestCount, setGuestCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    type: 'expense' as 'income' | 'expense',
    category: 'Hotel',
    description: '',
    amount_eur: '',
    date: new Date().toISOString().slice(0, 10),
    paid: true,
  })
  const [busy, setBusy] = useState(false)
  // The row being edited, and the values as they stand before saving.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Entry>>({})
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const [entriesRes, paymentsRes, bookingsRes, roomsRes, guestsRes] = await Promise.all([
  // Both pages read this one table but never share a row: the only figure
  // the two have in common is what came in from ticket sales. Everything
  // built on top of it -- every expense, every extra income -- belongs to
  // one page only, which is what `scope` says.
      supabase
        .from('finance_entries')
        .select('*')
        .eq('scope', scope)
        .order('date', { ascending: false }),
      supabase.from('payments').select('locator, order_code, ticket, price_eur'),
      supabase.from('bookings').select('room_id, check_in_date, check_out_date'),
      supabase.from('rooms').select('id, hotel, room_type'),
      supabase.from('guests').select('id', { count: 'exact', head: true }),
    ])
    setEntries((entriesRes.data as Entry[]) ?? [])
    setPayments((paymentsRes.data as Payment[]) ?? [])
    setBookings((bookingsRes.data as BookingRow[]) ?? [])
    setRooms((roomsRes.data as RoomRow[]) ?? [])
    setGuestCount(guestsRes.count ?? 0)
    setLoading(false)
  }, [supabase, scope])

  useEffect(() => {
    load()
  }, [load])

  const manual = useMemo(() => {
    let income = 0
    let expense = 0
    // Hotel expenses are money handed over against a cost we already compute
    // from the bookings, not a cost of their own. Counted in both places the
    // hotel gets charged twice.
    let hotelPaid = 0
    // What has been committed but not yet handed over. The Hotel category is
    // money already sent, so it is never part of what is still owed.
    let unpaidExpense = 0
    const byCategory = new Map<string, number>()
    for (const e of entries) {
      const amt = Number(e.amount_eur)
      if (e.type === 'income') income += amt
      else {
        expense += amt
        if (e.category === 'Hotel') hotelPaid += amt
        else if (!e.paid) unpaidExpense += amt
      }
      const key = `${e.type}:${e.category}`
      byCategory.set(key, (byCategory.get(key) ?? 0) + amt)
    }
    return { income, expense, hotelPaid, unpaidExpense, otherExpense: expense - hotelPaid, byCategory }
  }, [entries])

  const totalPaid = useMemo(
    () => payments.reduce((a, p) => a + Number(p.price_eur || 0), 0),
    [payments],
  )

  const hotelCost = useMemo(
    () => computeHotelCost(bookings, rooms, rates),
    [bookings, rooms, rates],
  )

  const grossMargin = totalPaid - hotelCost.total
  // The hotel appears once, as the computed cost. What we have handed over so
  // far is cash flow, shown separately.
  const netProfit = totalPaid + manual.income - hotelCost.total - manual.otherExpense
  const hotelOutstanding = hotelCost.total - manual.hotelPaid
  // Everything still to hand over: the rest of the hotel, plus the expenses
  // marked as not yet paid.
  const totalOutstanding = hotelOutstanding + manual.unpaidExpense

  const add = async () => {
    const amt = parseFloat(form.amount_eur)
    if (!Number.isFinite(amt) || amt <= 0) return
    setBusy(true)
    await supabase.from('finance_entries').insert({
      type: form.type,
      category: form.category,
      description: form.description || null,
      amount_eur: amt,
      date: form.date,
      scope,
      paid: form.paid,
    })
    setForm({ ...form, description: '', amount_eur: '' })
    setBusy(false)
    load()
  }

  const startEdit = (e: Entry) => {
    setEditingId(e.id)
    setDraft({ type: e.type, category: e.category, description: e.description, amount_eur: e.amount_eur, date: e.date, paid: e.paid })
  }

  const saveEdit = async () => {
    if (!editingId) return
    const amt = Number(draft.amount_eur)
    if (!Number.isFinite(amt) || amt <= 0) return
    setBusy(true)
    await supabase
      .from('finance_entries')
      .update({
        type: draft.type,
        category: draft.category,
        description: draft.description || null,
        amount_eur: amt,
        date: draft.date,
        paid: draft.paid,
      })
      .eq('id', editingId)
    setEditingId(null)
    setDraft({})
    setBusy(false)
    load()
  }

  // Paid is the one field worth flipping without opening the whole row.
  const togglePaid = async (e: Entry) => {
    await supabase.from('finance_entries').update({ paid: !e.paid }).eq('id', e.id)
    load()
  }

  const remove = async (id: string) => {
    if (!window.confirm(t('finance.deleteConfirm'))) return
    await supabase.from('finance_entries').delete().eq('id', id)
    load()
  }

  const onImport = async (file: File) => {
    setImportMsg(t('finance.importing'))
    const fd = new FormData()
    fd.append('file', file)
    const res = await importPaymentsXlsx(fd)
    if (res.ok) {
      setImportMsg(
        t('finance.imported', {
          inserted: res.inserted,
          updated: res.updated,
          amount: fmt(res.totalPrice),
        }) +
          // Silence here would look like the file simply had fewer rows.
          (res.skipped > 0 ? ` · ${res.skipped} test row(s) ignored` : ''),
      )
      load()
    } else {
      setImportMsg(t('finance.importError', { msg: res.error }))
    }
  }

  const onLogout = async () => {
    await logout()
    router.replace(loginPath)
  }

  if (loading) return <div className="p-6 text-muted-foreground">{t('finance.loading')}</div>

  return (
    <div className="min-h-screen p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/30 p-0.5">
            <Globe className="size-3.5 text-muted-foreground ml-1" />
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={lang === 'en'}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('es')}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                lang === 'es' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={lang === 'es'}
            >
              ES
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="size-4 mr-1" /> {t('finance.logout')}
          </Button>
        </div>
      </header>

      {/* Auto totals: payments vs hotel cost */}
      <section className="bg-card border border-border rounded-lg p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-foreground">{t('finance.summary')}</h2>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImport(f)
                e.target.value = ''
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4 mr-1" /> {t('finance.import')}
            </Button>
          </div>
        </div>
        {importMsg && (
          <p className="text-xs text-muted-foreground">{importMsg}</p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label={t('finance.paid')}
            value={totalPaid}
            tone="emerald"
            // Two different populations, and saying only one of them was the
            // bug: the export has a line per ticket sold, the guest list has a
            // row per person, and staff and Core Tribe never appear in a sale.
            hint={t('finance.paidHint', { guests: guestCount, rows: payments.length })}
          />
          <StatCard
            label={t('finance.hotelCost')}
            value={hotelCost.total}
            tone="rose"
            hint={t('finance.hotelCostHint', { n: hotelCost.nights })}
          />
          <StatCard
            label={t('finance.grossMargin')}
            value={grossMargin}
            tone={grossMargin >= 0 ? 'emerald' : 'rose'}
          />
          <StatCard label={t('finance.extraIncome')} value={manual.income} tone="emerald" />
          <StatCard
            label={t('finance.manualExpenses')}
            value={manual.otherExpense}
            tone="rose"
            hint="hotel shown separately"
          />
          <StatCard
            label={t('finance.netProfit')}
            value={netProfit}
            tone={netProfit >= 0 ? 'emerald' : 'rose'}
          />
          <StatCard label="Hotel paid so far" value={manual.hotelPaid} tone="emerald" />
          <StatCard
            label="Hotel still to pay"
            value={hotelOutstanding}
            tone={hotelOutstanding > 0 ? 'rose' : 'emerald'}
            hint="cost minus what we have handed over"
          />
          {showTotalOutstanding && (
            <StatCard
              label="Total still to pay"
              value={totalOutstanding}
              tone={totalOutstanding > 0 ? 'rose' : 'emerald'}
              hint={`hotel + ${fmt(manual.unpaidExpense)} of expenses not yet paid`}
            />
          )}
        </div>
        <div className="text-xs text-muted-foreground pt-1">
          {t('finance.ravepassNote', {
            h3: fmt(hotelCost.byHotel.H3),
            h4: fmt(hotelCost.byHotel.H4),
          })}
        </div>
      </section>

      {/* Add entry */}
      <section className="bg-card border border-border rounded-lg p-3 sm:p-4 space-y-3">
        <h2 className="font-semibold text-foreground">{t('finance.addManual')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <Select
            value={form.type}
            onValueChange={(v) =>
              setForm({
                ...form,
                type: v as 'income' | 'expense',
                category: v === 'income' ? CATEGORIES_INCOME[0] : CATEGORIES_EXPENSE[0],
              })
            }
          >
            <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="expense">{t('finance.typeExpense')}</SelectItem>
              <SelectItem value="income">{t('finance.typeIncome')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {(form.type === 'income' ? CATEGORIES_INCOME : CATEGORIES_EXPENSE).map((c) => (
                <SelectItem key={c} value={c}>{tCat(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={t('finance.formDescription')}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="bg-secondary border-border col-span-2"
          />
          <Input
            type="number"
            placeholder={t('finance.formAmount')}
            step="0.01"
            value={form.amount_eur}
            onChange={(e) => setForm({ ...form, amount_eur: e.target.value })}
            className="bg-secondary border-border"
          />
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="bg-secondary border-border"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
          <input
            type="checkbox"
            checked={form.paid}
            onChange={(e) => setForm({ ...form, paid: e.target.checked })}
            className="size-4 accent-primary"
          />
          Already paid (leave off for something still to be paid, like the DJs at the event)
        </label>
        <Button onClick={add} disabled={busy || !form.amount_eur}>
          <Plus className="size-4 mr-1" /> {t('finance.add')}
        </Button>
      </section>

      {/* List */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead className="bg-secondary text-muted-foreground uppercase text-xs">
              <tr>
                <th className="text-left px-3 py-2">{t('finance.colDate')}</th>
                <th className="text-left px-3 py-2">{t('finance.colType')}</th>
                <th className="text-left px-3 py-2">{t('finance.colCategory')}</th>
                <th className="text-left px-3 py-2">{t('finance.colDescription')}</th>
                <th className="text-right px-3 py-2">{t('finance.colAmount')}</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => {
                const editing = editingId === e.id
                if (editing) {
                  return (
                    <tr key={e.id} className="bg-secondary/40">
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          value={draft.date ?? ''}
                          onChange={(ev) => setDraft({ ...draft, date: ev.target.value })}
                          className="h-8 w-36 bg-card border-border text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={draft.type}
                          onValueChange={(v) =>
                            setDraft({
                              ...draft,
                              type: v as Entry['type'],
                              // The category lists do not overlap, so a type
                              // change has to bring a valid category with it.
                              category: v === 'income' ? CATEGORIES_INCOME[0] : CATEGORIES_EXPENSE[0],
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-28 bg-card border-border text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            <SelectItem value="expense">{t('finance.typeExpense')}</SelectItem>
                            <SelectItem value="income">{t('finance.typeIncome')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={draft.category}
                          onValueChange={(v) => setDraft({ ...draft, category: v })}
                        >
                          <SelectTrigger className="h-8 w-36 bg-card border-border text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            {(draft.type === 'income' ? CATEGORIES_INCOME : CATEGORIES_EXPENSE).map((c) => (
                              <SelectItem key={c} value={c}>{tCat(c)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={draft.description ?? ''}
                          onChange={(ev) => setDraft({ ...draft, description: ev.target.value })}
                          className="h-8 min-w-48 bg-card border-border text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          value={String(draft.amount_eur ?? '')}
                          onChange={(ev) => setDraft({ ...draft, amount_eur: Number(ev.target.value) })}
                          className="h-8 w-28 bg-card border-border text-sm text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={draft.paid ?? false}
                            onChange={(ev) => setDraft({ ...draft, paid: ev.target.checked })}
                            className="size-4 accent-primary"
                          />
                          paid
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="size-7 text-emerald-400" onClick={saveEdit} disabled={busy}>
                            <Check className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-muted-foreground"
                            onClick={() => { setEditingId(null); setDraft({}) }}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={e.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-2 whitespace-nowrap">{e.date}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs border ${
                          e.type === 'income'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {e.type === 'income' ? t('finance.typeIncome') : t('finance.typeExpense')}
                      </span>
                    </td>
                    <td className="px-3 py-2">{tCat(e.category)}</td>
                    <td className="px-3 py-2 text-foreground">{e.description ?? '—'}</td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        e.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {e.type === 'income' ? '+' : '−'}
                      {Number(e.amount_eur).toFixed(2)} €
                    </td>
                    <td className="px-3 py-2">
                      {/* One click, because this is the field that changes as
                          the event gets closer. */}
                      <button
                        type="button"
                        onClick={() => togglePaid(e)}
                        className={`inline-flex px-2 py-0.5 rounded text-xs border transition-colors ${
                          e.paid
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                        }`}
                      >
                        {e.paid ? 'paid' : 'to pay'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(e)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-muted-foreground hover:text-red-400"
                          onClick={() => remove(e.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    {t('finance.noEntries')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* By category breakdown */}
      <section className="bg-card border border-border rounded-lg p-3 sm:p-4">
        <h2 className="font-semibold text-foreground mb-2">{t('finance.byCategory')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[...manual.byCategory.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([key, sum]) => {
              const [type, cat] = key.split(':')
              return (
                <div key={key} className="flex items-center justify-between bg-secondary/30 border border-border rounded px-3 py-2">
                  <div>
                    <div className="text-sm text-foreground">{tCat(cat)}</div>
                    <div className="text-xs text-muted-foreground">
                      {type === 'income' ? t('finance.typeIncome') : t('finance.typeExpense')}
                    </div>
                  </div>
                  <div
                    className={`font-mono text-sm ${
                      type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {sum.toFixed(2)} €
                  </div>
                </div>
              )
            })}
          {manual.byCategory.size === 0 && (
            <div className="text-sm text-muted-foreground italic">{t('finance.noData')}</div>
          )}
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: number
  tone: 'emerald' | 'rose'
  hint?: string
}) {
  const color = tone === 'emerald' ? 'text-emerald-400' : 'text-rose-400'
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${color} mt-1`}>{fmt(value)}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  )
}
