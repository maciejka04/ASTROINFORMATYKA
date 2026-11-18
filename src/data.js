import * as d3 from 'd3'
import { rowsToTable } from './columns.js'
import { TextTableParser } from './textParser.js'

const DEFAULT_URL =
  'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select%20pl_name%2Chostname%2Cdisc_year%2Cpl_orbper%2Cpl_orbsmax%2Cpl_rade%2Cpl_bmasse%2Cpl_eqt%2Cst_teff%2Cst_mass%2Cst_rad%2Csy_dist%20from%20pscomppars&format=json'

export const DEFAULT_SOURCES = [
  { id: 'default', label: 'exoplanetarchive.ipac.caltech.edu/TAP/sync', url: DEFAULT_URL },
]

const MAX_JSON_FILE_BYTES = 400 * 1024 * 1024
const TEXT_SLICE = 1 << 20

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

export const columnLabel = (c, units = {}) => (units[c] ? `${c} [${units[c]}]` : c)

const isCrossOrigin = (url) => new URL(url, location.href).origin !== location.origin

export async function fetchText(url) {
  let res
  let viaProxy = false
  try {
    res = await fetch(url)
  } catch (err) {
    if (!isCrossOrigin(url)) throw err
    res = await fetch(`/proxy?url=${encodeURIComponent(new URL(url).href)}`)
    viaProxy = true
    if (res.headers.get('content-type')?.includes('text/html')) {
      throw new Error('serwer nie zezwala na pobieranie z przeglądarki (brak CORS), a proxy działa tylko w „npm run dev”')
    }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return { text: await res.text(), contentType: res.headers.get('content-type') ?? '', viaProxy }
}

const looksLikeJson = (text) => /^\s*[[{]/.test(text.replace(/^\uFEFF/, ''))

export function parseText(text, contentType = '', onProgress) {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) throw new Error('Pusta odpowiedź')
  if (looksLikeJson(trimmed)) {
    const json = parseJson(trimmed, contentType)
    if (json) return json
  }
  const parser = new TextTableParser()
  for (let i = 0; i < trimmed.length; i += TEXT_SLICE) {
    parser.push(trimmed.slice(i, i + TEXT_SLICE))
    onProgress?.(Math.min(1, (i + TEXT_SLICE) / trimmed.length), parser.rowCount)
  }
  return parser.finish()
}

export async function parseFile(file, onProgress) {
  const head = await file.slice(0, 4096).text()
  if (looksLikeJson(head)) {
    if (file.size > MAX_JSON_FILE_BYTES) {
      throw new Error(`Plik JSON jest za duży (${Math.round(file.size / 2 ** 20)} MB, limit ${MAX_JSON_FILE_BYTES / 2 ** 20} MB) - użyj CSV/tekstu`)
    }
    return parseText(await file.text(), file.type, onProgress)
  }

  const parser = new TextTableParser()
  const decoder = new TextDecoder()
  const reader = file.stream().getReader()
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parser.push(decoder.decode(value, { stream: true }))
    loaded += value.length
    onProgress?.(loaded / file.size, parser.rowCount)
  }
  parser.push(decoder.decode())
  return parser.finish()
}

function parseJson(trimmed, contentType) {
  try {
    return { format: 'JSON', tables: extractTables(JSON.parse(trimmed)).map(rowsToTable) }
  } catch (err) {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim())
    try {
      const rows = lines.map((l) => JSON.parse(l))
      return { format: 'NDJSON', tables: extractTables(rows).map(rowsToTable) }
    } catch {
      if (contentType.includes('json')) throw new Error(`Niepoprawny JSON: ${err.message}`)
      return null
    }
  }
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
