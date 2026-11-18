import * as d3 from 'd3'
import { ColumnBuilder, buildTable, PREVIEW_ROWS } from './columns.js'

const SNIFF_LINES = 50
const FORMAT_NAMES = { ',': 'CSV', '\t': 'TSV', ';': 'CSV (;)', '|': 'PSV (|)', ' ': 'tekst (kolumny rozdzielone spacjami)' }

const isComment = (l) => l.trimStart().startsWith('#')
const isBlank = (l) => !l.trim()
const isNumericToken = (t) => t !== '' && Number.isFinite(+t)
const splitWhitespace = (l) => l.trim().split(/\s+/)

export function detectDelimiter(dataLines) {
  const lines = dataLines.slice(0, 10)
  let best = ','
  let bestScore = 0
  let bestConsistent = false
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1)
    const consistent = counts.every((c) => c === counts[0])
    const score = counts[0] * (consistent ? 2 : 1)
    if (counts[0] > 0 && score > bestScore) { best = d; bestScore = score; bestConsistent = consistent }
  }
  if (best === '\t' && !bestConsistent) return ' '
  return bestScore ? best : ' '
}

export class TextTableParser {
  constructor() {
    this.rest = ''
    this.sniffed = []
    this.sniffedData = 0
    this.split = null
    this.builders = null
    this.headerPending = false
    this.rowCount = 0
    this.preview = []
    this.first = true
  }

  push(chunk) {
    if (this.first) { chunk = chunk.replace(/^\uFEFF/, ''); this.first = false }
    const lines = (this.rest + chunk).split('\n')
    this.rest = lines.pop()
    for (const l of lines) this.line(l)
  }

  finish() {
    if (this.rest) this.line(this.rest)
    this.rest = ''
    if (!this.split) this.start()
    if (!this.builders) throw new Error('Brak wierszy z danymi')
    return { format: FORMAT_NAMES[this.delimiter], tables: [buildTable('(tabela)', this.headers, this.builders, this.rowCount, this.preview)] }
  }

  line(raw) {
    const l = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (this.split) return this.dataLine(l)
    this.sniffed.push(l)
    if (!isBlank(l) && !isComment(l) && ++this.sniffedData >= SNIFF_LINES) this.start()
  }

  start() {
    const lines = this.sniffed
    this.sniffed = []
    const dataLines = lines.filter((l) => !isBlank(l) && !isComment(l))
    if (!dataLines.length) throw new Error('Brak wierszy z danymi')
    if (/^\s*<\?xml|^\s*<(html|!doctype)/i.test(dataLines[0])) {
      throw new Error('Odpowiedź to XML/HTML - obsługiwane są JSON, NDJSON, CSV, TSV i tekst kolumnowy')
    }

    this.delimiter = detectDelimiter(dataLines)
    if (this.delimiter === ' ') {
      this.split = splitWhitespace
      const firstData = lines.findIndex((l) => !isBlank(l) && !isComment(l))
      const headerComment = lines.slice(0, firstData).filter((l) => isComment(l) && l.replace(/^\s*#+/, '').trim()).pop()
      const headers = this.whitespaceHeader(dataLines, headerComment)
      if (headers) this.setHeaders(headers)
    } else {
      const d = this.delimiter
      const dsv = d3.dsvFormat(d)
      this.split = (l) => (l.includes('"') ? dsv.parseRows(l)[0] ?? [] : l.split(d)).map((t) => t.trim())
      this.headerPending = true
    }
    for (const l of lines) this.dataLine(l)
  }

  whitespaceHeader(dataLines, headerComment) {
    const width = d3.mode(dataLines, (l) => splitWhitespace(l).length)
    const fromComment = headerComment ? splitWhitespace(headerComment.replace(/^\s*#+/, '')) : null
    if (fromComment && fromComment.length === width && !fromComment.every(isNumericToken)) return fromComment
    const first = splitWhitespace(dataLines[0])
    if (first.length === width && first.every((t) => !isNumericToken(t))) {
      this.headerPending = true
      return null
    }
    return d3.range(width).map((i) => `col_${i + 1}`)
  }

  setHeaders(headers) {
    this.headers = headers
    this.builders = headers.map((h) => new ColumnBuilder(h))
  }

  dataLine(l) {
    if (isBlank(l) || isComment(l)) return
    const tokens = this.split(l)
    if (this.headerPending) {
      this.headerPending = false
      this.setHeaders(tokens)
      return
    }
    const b = this.builders
    for (let i = 0; i < b.length; i++) b[i].push(tokens[i])
    if (this.preview.length < PREVIEW_ROWS) this.preview.push(this.headers.map((_, i) => tokens[i] ?? ''))
    this.rowCount++
  }
}
