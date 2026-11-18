const CHUNK = 1 << 16
const SNIFF_ROWS = 1000
const MISSING = /^(nan|na|n\/a|null|none|inf|-inf|\+inf|infinity|-infinity|-|\?)$/i

export const PREVIEW_ROWS = 20

export class ColumnBuilder {
  constructor(name) {
    this.name = name
    this.chunks = []
    this.cur = new Float64Array(CHUNK)
    this.pos = 0
    this.length = 0
    this.numeric = 0
    this.text = 0
    this.dropped = false
  }

  push(token) {
    let v
    if (typeof token === 'number') v = token
    else if (typeof token === 'string' && token !== '') {
      v = +token
      if (v !== v && !MISSING.test(token.trim())) this.text++
    } else {
      v = NaN
      if (token !== null && token !== undefined && token !== '') this.text++
    }
    if (v - v === 0) this.numeric++
    else v = NaN

    this.length++
    if (this.dropped) return
    this.cur[this.pos++] = v
    if (this.pos === CHUNK) {
      this.chunks.push(this.cur)
      this.cur = new Float64Array(CHUNK)
      this.pos = 0
    }
    if (this.length === SNIFF_ROWS && this.text > this.numeric) this.drop()
  }

  drop() {
    this.dropped = true
    this.chunks = []
    this.cur = null
  }

  finish() {
    if (this.dropped || !this.numeric || this.numeric / (this.numeric + this.text) < 0.5) return null
    const values = new Float64Array(this.length)
    let offset = 0
    for (const c of this.chunks) { values.set(c, offset); offset += c.length }
    values.set(this.cur.subarray(0, this.pos), offset)
    this.chunks = []
    this.cur = null
    return { name: this.name, values }
  }
}

export function buildTable(name, headers, builders, rowCount, preview, units = {}) {
  const columns = builders.map((b) => b.finish()).filter(Boolean)
  return { name, rowCount, headers, preview, units, columns }
}

export function rowsToTable({ name, rows, units }) {
  const headers = [...new Set(rows.slice(0, 500).flatMap(Object.keys))]
  const builders = headers.map((h) => new ColumnBuilder(h))
  for (const r of rows) builders.forEach((b) => b.push(r[b.name]))
  const preview = rows.slice(0, PREVIEW_ROWS).map((r) => headers.map((h) => (r[h] == null ? '' : String(r[h]))))
  return buildTable(name, headers, builders, rows.length, preview, units)
}

export const transferables = (result) => result.tables.flatMap((t) => t.columns.map((c) => c.values.buffer))
