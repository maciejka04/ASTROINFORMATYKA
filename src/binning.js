// Fast histogram math over Float64Array columns (NaN = missing). A "filter" is
// { range: [lo, hi] | null, ignore: Set<number>, logX: boolean }.

const MAX_AUTO_BINS = 200
const MIN_AUTO_BINS = 5
const FD_SAMPLE = 200_000

function prepare({ range, ignore, logX }) {
  return {
    lo: range ? range[0] : -Infinity,
    hi: range ? range[1] : Infinity,
    positive: logX,
    ignored: Float64Array.from(ignore),
  }
}

// Hot path: called once per value, so it takes the pre-flattened filter from prepare().
function accepts(v, p) {
  if (!(v >= p.lo && v <= p.hi)) return false
  if (p.positive && v <= 0) return false
  const ig = p.ignored
  for (let j = 0; j < ig.length; j++) if (v === ig[j]) return false
  return true
}

export function columnExtent(values, filter) {
  const p = prepare(filter)
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (!accepts(v, p)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return lo <= hi ? [lo, hi] : null
}

export function padDomain([lo, hi], logX) {
  if (hi > lo) return [lo, hi]
  return logX ? [lo / 2, lo * 2] : [lo - 0.5, lo + 0.5]
}

export function makeEdges([lo, hi], count, logX) {
  const edges = new Float64Array(count + 1)
  const a = logX ? Math.log10(lo) : lo
  const step = ((logX ? Math.log10(hi) : hi) - a) / count
  for (let i = 0; i <= count; i++) edges[i] = logX ? 10 ** (a + i * step) : a + i * step
  edges[0] = lo
  edges[count] = hi
  return edges
}

export function binCounts(values, edges, filter) {
  const count = edges.length - 1
  const counts = new Uint32Array(count)
  const { logX } = filter
  const lo = edges[0]
  const hi = edges[count]
  const a = logX ? Math.log10(lo) : lo
  const scale = count / ((logX ? Math.log10(hi) : hi) - a)
  const p = prepare(filter)
  p.lo = Math.max(p.lo, lo)
  p.hi = Math.min(p.hi, hi)
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (!accepts(v, p)) continue
    let b = Math.floor(((logX ? Math.log10(v) : v) - a) * scale)
    if (b >= count) b = count - 1
    else if (b < 0) b = 0
    counts[b]++
  }
  return counts
}

function quickselect(arr, k) {
  let left = 0
  let right = arr.length - 1
  while (right > left) {
    const pivot = arr[(left + right) >> 1]
    let i = left
    let j = right
    while (i <= j) {
      while (arr[i] < pivot) i++
      while (arr[j] > pivot) j--
      if (i <= j) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; i++; j-- }
    }
    if (k <= j) right = j
    else if (k >= i) left = i
    else break
  }
  return arr[k]
}

function median(sorted, n) {
  const mid = n >> 1
  const upper = quickselect(sorted, mid)
  if (n % 2) return upper
  let lower = -Infinity
  for (let i = 0; i < mid; i++) if (sorted[i] > lower) lower = sorted[i]
  return (lower + upper) / 2
}

export function filteredValues(values, filter) {
  const p = prepare(filter)
  const out = new Float64Array(values.length)
  let n = 0
  for (let i = 0; i < values.length; i++) if (accepts(values[i], p)) out[n++] = values[i]
  return out.subarray(0, n)
}

export function columnStats(values, filter) {
  const kept = filteredValues(values, filter)
  const n = kept.length
  if (!n) return null
  let mean = 0
  let m2 = 0
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < n; i++) {
    const v = kept[i]
    const d = v - mean
    mean += d / (i + 1)
    m2 += d * (v - mean)
    if (v < min) min = v
    if (v > max) max = v
  }
  return { n, mean, std: n > 1 ? Math.sqrt(m2 / (n - 1)) : undefined, min, max, median: median(kept, n) }
}

// Freedman–Diaconis rule on a strided sample of all drawn columns, computed in the axis space (log10 for log X).
export function autoBinCount(columns, domain, logX) {
  const picked = []
  for (const { values, filter } of columns) {
    const p = prepare(filter)
    const stride = Math.max(1, Math.floor(values.length / (FD_SAMPLE / columns.length)))
    for (let i = 0; i < values.length; i += stride) {
      const v = values[i]
      if (accepts(v, p)) picked.push(logX ? Math.log10(v) : v)
    }
  }
  if (picked.length < 2) return 30
  const sample = Float64Array.from(picked).sort()
  const q = (p) => sample[Math.floor(p * (sample.length - 1))]
  const iqr = q(0.75) - q(0.25)
  if (!iqr) return 30
  const h = 2 * iqr * sample.length ** (-1 / 3)
  const span = logX ? Math.log10(domain[1]) - Math.log10(domain[0]) : domain[1] - domain[0]
  return Math.min(Math.max(Math.round(span / h), MIN_AUTO_BINS), MAX_AUTO_BINS)
}

const ID_NAME = /(^|[^a-z])(id|designation)$|^id[^a-z]/i

function looksLikeId({ name, values }) {
  if (ID_NAME.test(name)) return true
  const seen = new Set()
  let n = 0
  for (let i = 0; i < values.length && n < 5000; i++) {
    const v = values[i]
    if (v !== v) continue
    if (!Number.isInteger(v) || v <= 1e6 || seen.has(v)) return false
    seen.add(v)
    n++
  }
  return n > 1
}

const NO_FILTER = { range: null, ignore: new Set(), logX: false }

function isConstant({ values }) {
  const e = columnExtent(values, NO_FILTER)
  return !e || e[0] === e[1]
}

export function defaultColumn(columns) {
  return (columns.find((c) => !looksLikeId(c) && !isConstant(c)) ?? columns[0])?.name ?? ''
}
