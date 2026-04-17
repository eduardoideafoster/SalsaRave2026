'use client'

import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'

export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string> {
  key: K
  dir: SortDir
}

interface Props<K extends string> {
  label: string
  sortKey: K
  state: SortState<K> | null
  onSort: (next: SortState<K>) => void
  align?: 'left' | 'right'
  className?: string
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  state,
  onSort,
  align = 'left',
  className,
}: Props<K>) {
  const active = state?.key === sortKey
  const dir = active ? state!.dir : null
  const Icon = dir === 'asc' ? ChevronUp : dir === 'desc' ? ChevronDown : ChevronsUpDown

  return (
    <th className={`px-4 py-3 text-${align} text-xs font-semibold uppercase tracking-wider ${className ?? ''}`}>
      <button
        type="button"
        onClick={() =>
          onSort({
            key: sortKey,
            dir: active && state!.dir === 'asc' ? 'desc' : 'asc',
          })
        }
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </th>
  )
}

// Generic comparator helper — returns a sort function for a given (value extractor, direction).
export function compareBy<T>(get: (row: T) => string | number | null | undefined, dir: SortDir) {
  return (a: T, b: T) => {
    const va = get(a)
    const vb = get(b)
    // Nulls sort last regardless of direction.
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return dir === 'asc' ? va - vb : vb - va
    const sa = String(va).toLowerCase()
    const sb = String(vb).toLowerCase()
    if (sa < sb) return dir === 'asc' ? -1 : 1
    if (sa > sb) return dir === 'asc' ? 1 : -1
    return 0
  }
}
