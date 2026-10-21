import * as d3 from 'd3'

const EXO_COLUMNS = [
  'pl_name', 'hostname', 'disc_year', 'pl_orbper', 'pl_orbsmax', 'pl_rade',
  'pl_bmasse', 'pl_eqt', 'st_teff', 'st_mass', 'st_rad', 'sy_dist',
]

const EXO_QUERY = `select ${EXO_COLUMNS.join(',')} from pscomppars`

export const DEFAULT_SOURCES = [
  {
    id: 'nasa-exoplanets',
    label: 'NASA Exoplanet Archive (przykład)',
    url: `/api/exoplanets?query=${encodeURIComponent(EXO_QUERY)}&format=json`,
  },
]

export function normalizeUrl(input) {
  const url = input.trim().replace(/^["'<]+|["'>]+$/g, '').replace(/\s+/g, '')
  if (!url) return ''
  if (url.startsWith('/') || /^https?:\/\//i.test(url)) return url
  return `https://${url}`
}

export function sourceLabel(url) {
  try {
    const u = new URL(url, location.href)
    return `${u.hostname}${u.pathname}`.replace(/\/$/, '')
  } catch {
    return url
  }
}

export const COLUMN_LABELS = {
  disc_year: 'Rok odkrycia',
  pl_orbper: 'Okres orbitalny [dni]',
  pl_orbsmax: 'Wielka półoś [AU]',
  pl_rade: 'Promień planety [R⊕]',
  pl_bmasse: 'Masa planety [M⊕]',
  pl_eqt: 'Temperatura równowagowa [K]',
  st_teff: 'Temperatura gwiazdy [K]',
  st_mass: 'Masa gwiazdy [M☉]',
  st_rad: 'Promień gwiazdy [R☉]',
  sy_dist: 'Odległość [pc]',
}

export const columnLabel = (c, units = {}) =>
  COLUMN_LABELS[c] ?? (units[c] ? `${c} [${units[c]}]` : c)

const isCrossOrigin = (url) => new URL(url, location.href).origin !== location.origin

async function fetchText(url) {
  let res
  let viaProxy = false
  try {
    res = await fetch(url)
  } catch (err) {
    if (!isCrossOrigin(url)) throw err
    res = await fetch(`/proxy?url=${encodeURIComponent(new URL(url).href)}`)
    viaProxy = true
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return { text: await res.text(), contentType: res.headers.get('content-type') ?? '', viaProxy }
}

export async function loadFromUrl(url) {
  const { text, contentType, viaProxy } = await fetchText(url)
  return { ...parseText(text, contentType), viaProxy }
}

export function parseText(text, contentType = '') {
  const trimmed = text.replace(/^﻿/, '').trim()
  if (!trimmed) throw new Error('Pusta odpowiedź')

  if (/^[[{]/.test(trimmed)) {
    try {
      return { format: 'JSON', tables: extractTables(JSON.parse(trimmed)) }
    } catch (err) {
      const lines = trimmed.split(/\r?\n/).filter((l) => l.trim())
      try {
        const rows = lines.map((l) => JSON.parse(l))
        return { format: 'NDJSON', tables: extractTables(rows) }
      } catch {
        if (contentType.includes('json')) throw new Error(`Niepoprawny JSON: ${err.message}`)
      }
    }
  }

  if (/^\s*<\?xml|^\s*<(html|!doctype)/i.test(trimmed)) {
    throw new Error('Odpowiedź to XML/HTML – obsługiwane są JSON, NDJSON, CSV, TSV')
  }

  const delimiter = detectDelimiter(trimmed)
  const rows = d3.dsvFormat(delimiter).parse(trimmed, d3.autoType)
  const name = { ',': 'CSV', '\t': 'TSV', ';': 'CSV (;)', '|': 'PSV (|)', ' ': 'tekst (spacje)' }[delimiter]
  return { format: name, tables: [{ name: '(tabela)', rows: rows.map(cleanRow), units: {} }] }
}

function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).slice(0, 10)
  let best = ','
  let bestScore = 0
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1)
    const consistent = counts.every((c) => c === counts[0])
    const score = counts[0] * (consistent ? 2 : 1)
    if (counts[0] > 0 && score > bestScore) { best = d; bestScore = score }
  }
  return bestScore ? best : ' '
}

function cleanRow(r) {
  const out = {}
  for (const [k, v] of Object.entries(r)) out[k.trim()] = v instanceof Date ? v.toISOString() : v
  return out
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isPrimitive = (v) => v === null || typeof v !== 'object'

function flatten(obj, prefix = '', out = {}, depth = 0) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (isPlainObject(v) && depth < 4) flatten(v, key, out, depth + 1)
    else if (Array.isArray(v)) {
      if (v.length <= 10 && v.every(isPrimitive)) v.forEach((x, i) => { out[`${key}.${i}`] = x })
    } else out[key] = v
  }
  return out
}

function arrayToRows(arr) {
  if (arr.every(isPlainObject)) return arr.map((o) => flatten(o))
  if (arr.every(Array.isArray)) {
    const hasHeader = arr[0].every((v) => typeof v === 'string') && arr.length > 1
    const header = hasHeader ? arr[0] : arr[0].map((_, i) => `col_${i}`)
    return (hasHeader ? arr.slice(1) : arr).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
  }
  if (arr.every(isPrimitive)) return arr.map((value) => ({ value }))
  return null
}

function columnarToRows(obj) {
  const arrays = Object.entries(obj).filter(([, v]) => Array.isArray(v) && v.length && v.every(isPrimitive))
  if (!arrays.length) return null
  const len = d3.mode(arrays, ([, v]) => v.length)
  const cols = arrays.filter(([, v]) => v.length === len)
  if (cols.length < 2 && len < 2) return null
  return d3.range(len).map((i) => Object.fromEntries(cols.map(([k, v]) => [k, v[i]])))
}

function extractTables(json) {
  const found = []

  const visit = (node, path, parent, key, depth) => {
    if (depth > 5) return
    if (Array.isArray(node)) {
      const rows = node.length ? arrayToRows(node) : null
      if (rows) found.push({ name: path || '(korzeń)', rows, units: {} })
      return
    }
    if (!isPlainObject(node)) return

    const rows = columnarToRows(node)
    if (rows) {
      const units = parent && isPlainObject(parent[`${key}_units`]) ? parent[`${key}_units`] : {}
      found.push({ name: path || '(korzeń)', rows, units })
    }
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v) && v.every(isPrimitive)) continue
      visit(v, path ? `${path}.${k}` : k, node, k, depth + 1)
    }
  }

  visit(json, '', null, null, 0)

  if (!found.length) {
    if (isPlainObject(json)) return [{ name: '(obiekt)', rows: [flatten(json)], units: {} }]
    throw new Error('Nie znaleziono danych tabelarycznych w odpowiedzi')
  }

  const size = (t) => t.rows.length * Object.keys(t.rows[0] ?? {}).length
  return found.sort((a, b) => size(b) - size(a))
}

export function numericColumns(rows) {
  if (!rows.length) return []
  const keys = [...new Set(rows.slice(0, 500).flatMap(Object.keys))]
  return keys.filter((k) => {
    let nonEmpty = 0
    let numeric = 0
    for (const r of rows) {
      const v = r[k]
      if (v === null || v === undefined || v === '' || typeof v === 'boolean') continue
      nonEmpty++
      if (Number.isFinite(+v)) numeric++
    }
    return nonEmpty > 0 && numeric / nonEmpty >= 0.5
  })
}

export function columnValues(rows, column) {
  const out = []
  for (const r of rows) {
    const v = r[column]
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') continue
    const n = +v
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}
