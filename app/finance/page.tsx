'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Trash2, Plus, LogOut } from 'lucide-react'
import { logout } from './login/actions'
import { useRouter } from 'next/navigation'

interface Entry {
  id: string
  type: 'income' | 'expense'
  category: string
  description: string | null
  amount_eur: number
  date: string
  created_at: string
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

export default function FinancePage() {
  const supabase = createClient()
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    type: 'expense' as 'income' | 'expense',
    category: 'Hotel',
    description: '',
    amount_eur: '',
    date: new Date().toISOString().slice(0, 10),
  })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('finance_entries')
      .select('*')
      .order('date', { ascending: false })
    setEntries((data as Entry[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    const byCategory = new Map<string, number>()
    for (const e of entries) {
      const amt = Number(e.amount_eur)
      if (e.type === 'income') income += amt
      else expense += amt
      const key = `${e.type}:${e.category}`
      byCategory.set(key, (byCategory.get(key) ?? 0) + amt)
    }
    return { income, expense, net: income - expense, byCategory }
  }, [entries])

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
    })
    setForm({ ...form, description: '', amount_eur: '' })
    setBusy(false)
    load()
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this entry?')) return
    await supabase.from('finance_entries').delete().eq('id', id)
    load()
  }

  const onLogout = async () => {
    await logout()
    router.replace('/finance/login')
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>

  return (
    <div className="min-h-screen p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-foreground">Finance</h1>
        <Button variant="ghost" size="sm" onClick={onLogout}>
          <LogOut className="size-4 mr-1" /> Log out
        </Button>
      </header>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Income" value={totals.income} tone="emerald" />
        <StatCard label="Expense" value={totals.expense} tone="rose" />
        <StatCard label="Net" value={totals.net} tone={totals.net >= 0 ? 'emerald' : 'rose'} />
      </div>

      {/* Add entry */}
      <section className="bg-card border border-border rounded-lg p-3 sm:p-4 space-y-3">
        <h2 className="font-semibold text-foreground">Add entry</h2>
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
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {(form.type === 'income' ? CATEGORIES_INCOME : CATEGORIES_EXPENSE).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="bg-secondary border-border col-span-2"
          />
          <Input
            type="number"
            placeholder="€"
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
        <Button onClick={add} disabled={busy || !form.amount_eur}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </section>

      {/* List */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead className="bg-secondary text-muted-foreground uppercase text-xs">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
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
                      {e.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{e.category}</td>
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground hover:text-red-400"
                      onClick={() => remove(e.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* By category breakdown */}
      <section className="bg-card border border-border rounded-lg p-3 sm:p-4">
        <h2 className="font-semibold text-foreground mb-2">By category</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[...totals.byCategory.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([key, sum]) => {
              const [type, cat] = key.split(':')
              return (
                <div key={key} className="flex items-center justify-between bg-secondary/30 border border-border rounded px-3 py-2">
                  <div>
                    <div className="text-sm text-foreground">{cat}</div>
                    <div className="text-xs text-muted-foreground">{type}</div>
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
          {totals.byCategory.size === 0 && (
            <div className="text-sm text-muted-foreground italic">No data.</div>
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
}: {
  label: string
  value: number
  tone: 'emerald' | 'rose'
}) {
  const color = tone === 'emerald' ? 'text-emerald-400' : 'text-rose-400'
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${color} mt-1`}>{value.toFixed(2)} €</div>
    </div>
  )
}
