// CSV parsing and generation utilities

export function escapeCSV(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function generateCSV(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((r) => r.map(escapeCSV).join(','))
    .join('\n')
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let i = 0

  while (i < text.length) {
    const row: string[] = []
    while (i < text.length) {
      let value = ''
      if (text[i] === '"') {
        i++
        while (i < text.length) {
          if (text[i] === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') {
              value += '"'
              i += 2
            } else {
              i++
              break
            }
          } else {
            value += text[i]
            i++
          }
        }
      } else {
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          value += text[i]
          i++
        }
      }
      row.push(value.trim())
      if (i < text.length && text[i] === ',') {
        i++
      } else {
        break
      }
    }
    if (i < text.length && text[i] === '\r') i++
    if (i < text.length && text[i] === '\n') i++
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
      rows.push(row)
    }
  }
  return rows
}

export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => h.toLowerCase().trim())
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? ''
    })
    return obj
  })
}
