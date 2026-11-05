import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import Histogram from './Histogram.jsx'
import RangeFilter from './RangeFilter.jsx'
import ColumnPicker from './ColumnPicker.jsx'
import { DEFAULT_SOURCES, normalizeUrl, sourceLabel, columnLabel } from './data.js'
import { loadUrl, loadFile } from './loadData.js'
import {
  columnExtent, padDomain, makeEdges, binCounts, columnStats, autoBinCount, defaultColumn,
} from './binning.js'

const fmt = d3.format('.4~g')
const fmtInt = (n) => n.toLocaleString('pl-PL')
const EMPTY = []
const EMPTY_RANGES = {}
const IDLE = { loading: false, error: null, progress: null }
const COLORS = d3.schemeTableau10
const FILE_ID = '__local-file__'
const FILE_EXTENSIONS = ['.csv', '.tsv', '.txt', '.json', '.geojson', '.ndjson', '.dat']
const STORAGE_KEY = 'astro-histogram-links'
const LEGACY_STORAGE_KEY = 'astro-histogram-sources'
const MODES = [
  ['overlay', 'Nałożone (półprzezroczyste)'],
  ['stacked', 'Skumulowane (jeden na drugim)'],
  ['grouped', 'Obok siebie (w każdym przedziale)'],
  ['panels', 'Osobne panele (wspólna oś X)'],
]

function loadSavedSources() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (Array.isArray(saved) && saved.length) return saved
  } catch {}
  return DEFAULT_SOURCES
}

const parseIgnore = (text) =>
  new Set(text.split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite))

// Per-column memo: recomputes a column's result only when one of its own inputs changed,
// so editing one column's range does not rescan the other (possibly multi-million-row) columns.
function useColumnCache() {
  const ref = useRef(new Map())
  return useCallback((key, deps, compute) => {
    const hit = ref.current.get(key)
    if (hit && hit.deps.every((d, i) => Object.is(d, deps[i]))) return hit.value
    const value = compute()
    ref.current.set(key, { deps, value })
    return value
  }, [])
}

export default function App() {
  const [sources, setSources] = useState(loadSavedSources)
  const [sourceId, setSourceId] = useState(() => sources[0]?.id ?? '')
  const [newUrl, setNewUrl] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const histogramRef = useRef(null)

  const [linkResult, setLinkResult] = useState(null)
  const [file, setFile] = useState(null)
  const [tableIdx, setTableIdx] = useState(0)
  const [status, setStatus] = useState(IDLE)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)
  const fileAbortRef = useRef(null)

  const [selected, setSelected] = useState([])
  const [mode, setMode] = useState('overlay')
  const [binCount, setBinCount] = useState(40)
  const [autoBins, setAutoBins] = useState(false)
  const [logX, setLogX] = useState(false)
  const [rangeState, setRangeState] = useState({ scope: null, ranges: {} })
  const [ignoreText, setIgnoreText] = useState('')
  const extentCache = useColumnCache()
  const binCache = useColumnCache()
  const statsCache = useColumnCache()

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sources)) } catch {}
  }, [sources])

  const cancelFileLoad = () => {
    fileAbortRef.current?.abort()
    fileAbortRef.current = null
  }

  const addSource = (e) => {
    e.preventDefault()
    const url = normalizeUrl(newUrl)
    if (!url) return
    const existing = sources.find((s) => s.url === url)
    if (existing) {
      selectSource(existing.id)
      setReloadKey((k) => k + 1)
    } else {
      const src = { id: crypto.randomUUID(), label: sourceLabel(url), url }
      setSources((list) => [...list, src])
      selectSource(src.id)
    }
    setNewUrl('')
  }

  const selectSource = (id) => {
    if (id !== FILE_ID && file && !file.data) {
      cancelFileLoad()
      setFile(null)
    }
    if (id === FILE_ID) setStatus(IDLE)
    setSourceId(id)
    setTableIdx(0)
  }

  const removeSource = () => {
    if (sourceId === FILE_ID) {
      cancelFileLoad()
      setFile(null)
      selectSource(sources[0]?.id ?? '')
      return
    }
    const rest = sources.filter((s) => s.id !== sourceId)
    setSources(rest)
    selectSource(rest[0]?.id ?? (file?.data ? FILE_ID : ''))
  }

  const openFile = useCallback((f) => {
    if (!f) return
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!FILE_EXTENSIONS.includes(ext)) {
      setStatus({ ...IDLE, error: `Nieobsługiwany typ pliku „${f.name}” (dozwolone: ${FILE_EXTENSIONS.join(', ')})` })
      return
    }
    fileAbortRef.current?.abort()
    const ctrl = new AbortController()
    fileAbortRef.current = ctrl
    setFile({ name: f.name, data: null })
    setSourceId(FILE_ID)
    setTableIdx(0)
    setStatus({ loading: true, error: null, progress: null })
    const t0 = performance.now()
    loadFile(f, (progress) => setStatus((s) => ({ ...s, progress })), ctrl.signal)
      .then((data) => {
        setFile({ name: f.name, data: { ...data, ms: performance.now() - t0 } })
        setStatus(IDLE)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setStatus({ ...IDLE, error: `Plik „${f.name}”: ${err.message}` })
      })
  }, [])

  useEffect(() => {
    let depth = 0
    const hasFiles = (e) => e.dataTransfer?.types?.includes('Files')
    const onEnter = (e) => { if (hasFiles(e)) { depth++; setDragging(true) } }
    const onLeave = (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false) } }
    const onOver = (e) => { if (hasFiles(e)) e.preventDefault() }
    const onDrop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      openFile(e.dataTransfer.files[0])
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [openFile])

  const url = sources.find((s) => s.id === sourceId)?.url ?? ''

  useEffect(() => {
    if (!url) {
      setLinkResult(null)
      return
    }
    const ctrl = new AbortController()
    setStatus({ loading: true, error: null, progress: null })
    const t0 = performance.now()
    loadUrl(url, (progress) => setStatus((s) => ({ ...s, progress })), ctrl.signal)
      .then((data) => {
        setLinkResult({ ...data, ms: performance.now() - t0 })
        setTableIdx(0)
        setStatus(IDLE)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setLinkResult(null)
        setStatus({ ...IDLE, error: err.message })
      })
    return () => ctrl.abort()
  }, [url, reloadKey])

  const isFile = sourceId === FILE_ID
  const result = isFile ? file?.data : linkResult
  const table = result?.tables[tableIdx]
  const columns = table?.columns ?? EMPTY
  const units = table?.units
  const byName = useMemo(() => new Map(columns.map((c) => [c.name, c])), [columns])
  const label = useCallback((c) => columnLabel(c, units), [units])
  const colorOf = useCallback((c) => COLORS[Math.max(0, selected.indexOf(c)) % COLORS.length], [selected])

  useEffect(() => {
    setSelected((prev) => {
      const kept = prev.filter((n) => byName.has(n))
      if (kept.length) return kept
      const first = defaultColumn(columns)
      return first ? [first] : []
    })
  }, [columns, byName])

  const ignore = useMemo(() => parseIgnore(ignoreText), [ignoreText])

  // Ranges belong to one (table, ignored values, log scale) scope; changing any of these starts afresh.
  const rangeScope = useMemo(() => ({ columns, ignore, logX }), [columns, ignore, logX])
  const ranges = rangeState.scope === rangeScope ? rangeState.ranges : EMPTY_RANGES
  const setRanges = useCallback((update) => {
    setRangeState((prev) => {
      const current = prev.scope === rangeScope ? prev.ranges : EMPTY_RANGES
      return { scope: rangeScope, ranges: typeof update === 'function' ? update(current) : update }
    })
  }, [rangeScope])

  const extents = useMemo(() => {
    const out = {}
    for (const n of selected) {
      const c = byName.get(n)
      const e = c && extentCache(n, [c.values, ignore, logX], () => columnExtent(c.values, { range: null, ignore, logX }))
      if (e) out[n] = e
    }
    return out
  }, [selected, byName, ignore, logX, extentCache])

  const drawn = useMemo(() => selected.filter((n) => extents[n]), [selected, extents])

  const filters = useMemo(
    () => Object.fromEntries(drawn.map((n) => [n, { range: ranges[n] ?? null, ignore, logX }])),
    [drawn, ranges, ignore, logX]
  )

  const edges = useMemo(() => {
    if (!drawn.length) return null
    const lo = d3.min(drawn, (n) => (ranges[n] ?? extents[n])[0])
    const hi = d3.max(drawn, (n) => (ranges[n] ?? extents[n])[1])
    const domain = padDomain([lo, hi], logX)
    const count = autoBins
      ? autoBinCount(drawn.map((n) => ({ values: byName.get(n).values, filter: filters[n] })), domain, logX)
      : binCount
    return makeEdges(domain, count, logX)
  }, [drawn, ranges, extents, logX, autoBins, binCount, byName, filters])

  const filterDeps = (n, f) => [byName.get(n).values, f.range?.[0], f.range?.[1], f.ignore, f.logX]

  const series = useMemo(
    () => (edges ? drawn.map((n) => ({
      name: label(n),
      color: colorOf(n),
      counts: binCache(n, [edges, ...filterDeps(n, filters[n])], () => binCounts(byName.get(n).values, edges, filters[n])),
    })) : EMPTY),
    [edges, drawn, label, colorOf, byName, filters, binCache]
  )

  const deferredDrawn = useDeferredValue(drawn)
  const deferredFilters = useDeferredValue(filters)
  const stats = useMemo(
    () => deferredDrawn.filter((n) => deferredFilters[n] && byName.has(n)).map((n) => ({
      name: n,
      ...statsCache(n, filterDeps(n, deferredFilters[n]), () => columnStats(byName.get(n).values, deferredFilters[n])),
    })),
    [deferredDrawn, deferredFilters, byName, statsCache]
  )

  const handleBrush = useCallback(([a, b]) => {
    setRanges((prev) => {
      const next = { ...prev }
      for (const n of drawn) {
        const [e0, e1] = extents[n]
        const lo = Math.max(a, e0)
        const hi = Math.min(b, e1)
        next[n] = lo <= hi ? [lo, hi] : [a, b]
      }
      return next
    })
  }, [drawn, extents])

  const progress = status.progress
  const shownColumns = new Set(selected)

  return (
    <div className="app">
      <header>
        <h1>Interaktywny histogram</h1>
      </header>

      <section className="panel controls">
        <div className="control">
          <label htmlFor="new-url">Dodaj źródło (URL do API)</label>
          <form className="url-form" onSubmit={addSource}>
            <input
              id="new-url"
              type="text"
              placeholder="https://… (JSON, CSV, TSV, GeoJSON…)"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <button type="submit" disabled={!newUrl.trim()}>Dodaj</button>
          </form>

          <label>Albo wczytaj plik z dysku</label>
          <div className="url-form">
            <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()}>
              Wybierz plik…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_EXTENSIONS.join(',')}
              hidden
              onChange={(e) => { openFile(e.target.files[0]); e.target.value = '' }}
            />
          </div>
          <small>…lub przeciągnij plik na stronę ({FILE_EXTENSIONS.join(', ')}). Plik nie jest zapamiętywany po odświeżeniu strony.</small>

          <label htmlFor="source">Źródło danych</label>
          <div className="url-form">
            <select id="source" value={sourceId} onChange={(e) => selectSource(e.target.value)} disabled={!sources.length && !file}>
              {sources.map((s) => <option key={s.id} value={s.id} title={s.url}>{s.label}</option>)}
              {file && <option value={FILE_ID}>Plik: {file.name}</option>}
            </select>
            <button className="secondary" onClick={removeSource} disabled={!sourceId} title="Usuń źródło">✕</button>
          </div>
          <button className="secondary" onClick={() => setReloadKey((k) => k + 1)} disabled={!url || status.loading}>
            ↻ Odśwież dane
          </button>
          <small className="status">
            {status.loading && (
              <>
                <progress value={progress?.fraction ?? undefined} max={1} />
                {' '}Wczytywanie…{progress && ` ${Math.round(progress.fraction * 100)}% · ${fmtInt(progress.rows)} wierszy`}
              </>
            )}
            {status.error && <span className="error">Błąd: {status.error}</span>}
            {!status.loading && !status.error && table &&
              `${isFile ? `${file.name} · ` : ''}${result.format}${result.viaProxy ? ' (przez proxy)' : ''} · ` +
              `${fmtInt(table.rowCount)} wierszy, ${columns.length} kolumn liczbowych · ${(result.ms / 1000).toFixed(1)} s`}
          </small>
          {result?.tables.length > 1 && (
            <>
              <label htmlFor="table">Tabela w odpowiedzi</label>
              <select id="table" value={tableIdx} onChange={(e) => setTableIdx(+e.target.value)}>
                {result.tables.map((t, i) => <option key={t.name} value={i}>{t.name} ({fmtInt(t.rowCount)} wierszy)</option>)}
              </select>
            </>
          )}
        </div>

        <div className="control">
          <label>Kolumny (można wybrać kilka)</label>
          <ColumnPicker
            columns={columns.map((c) => c.name)}
            selected={selected}
            onChange={setSelected}
            colorOf={colorOf}
            label={label}
          />

          <label htmlFor="mode">Sposób rysowania</label>
          <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>

          <label htmlFor="bins">
            Liczba przedziałów: {autoBins ? `${edges ? edges.length - 1 : '—'} (automatycznie, reguła F-D)` : binCount}
          </label>
          <input
            id="bins"
            type="range"
            min={5}
            max={150}
            value={binCount}
            disabled={autoBins}
            onChange={(e) => setBinCount(+e.target.value)}
          />

          <label className="checkbox">
            <input type="checkbox" checked={autoBins} onChange={(e) => setAutoBins(e.target.checked)} />
            Automatyczny dobór przedziałów (Freedman–Diaconis)
          </label>

          <label className="checkbox">
            <input type="checkbox" checked={logX} onChange={(e) => setLogX(e.target.checked)} />
            Skala logarytmiczna osi X
          </label>
        </div>

        <div className="control">
          <label htmlFor="ignore">Pomijaj wartości (np. znacznik braku danych)</label>
          <input
            id="ignore"
            type="text"
            placeholder="np. -100, -999"
            value={ignoreText}
            onChange={(e) => setIgnoreText(e.target.value)}
          />

          <label>Zakres dla każdej kolumny</label>
          {drawn.length ? (
            <>
              {drawn.map((n) => (
                <div key={n} className="column-range">
                  <span className="column-range-name"><span className="swatch" style={{ background: colorOf(n) }} />{label(n)}</span>
                  <RangeFilter
                    extent={extents[n]}
                    range={ranges[n] ?? extents[n]}
                    logX={logX}
                    onChange={(r) => setRanges((prev) => ({ ...prev, [n]: r }))}
                  />
                </div>
              ))}
              <button className="secondary" onClick={() => setRanges({})} disabled={!Object.keys(ranges).length}>
                Resetuj zakresy
              </button>
              <small>Wskazówka: zaznacz zakres myszą na wykresie – zostanie ustawiony dla wszystkich rysowanych kolumn.</small>
            </>
          ) : <small>—</small>}
        </div>
      </section>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
          <button className="secondary" onClick={() => histogramRef.current?.exportSvg()}>
            💾 Pobierz wykres (SVG)
          </button>
        </div>

        <Histogram
          ref={histogramRef}
          series={series}
          edges={edges}
          mode={mode}
          logX={logX}
          xLabel={drawn.length === 1 ? label(drawn[0]) : 'Wartość'}
          onBrush={handleBrush}
        />
        {stats.length > 0 && (
          <table className="stats">
            <thead>
              <tr><th>kolumna</th><th>N</th><th>średnia</th><th>mediana</th><th>odch. std.</th><th>min</th><th>max</th></tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.name}>
                  <td><span className="swatch" style={{ background: colorOf(s.name) }} />{label(s.name)}</td>
                  {s.n ? (
                    <>
                      <td>{fmtInt(s.n)}</td>
                      <td>{fmt(s.mean)}</td>
                      <td>{fmt(s.median)}</td>
                      <td>{s.std === undefined ? '—' : fmt(s.std)}</td>
                      <td>{fmt(s.min)}</td>
                      <td>{fmt(s.max)}</td>
                    </>
                  ) : <td colSpan={6}>brak danych w zakresie</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {table?.preview.length > 0 && (
        <details className="panel">
          <summary>Podgląd tabeli danych (pierwsze {table.preview.length} wierszy)</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{table.headers.map((h) => <th key={h} className={shownColumns.has(h) ? 'active' : ''}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {table.preview.map((r, i) => (
                  <tr key={i}>
                    {table.headers.map((h, j) => <td key={h} className={shownColumns.has(h) ? 'active' : ''}>{r[j]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {dragging && <div className="drop-overlay">Upuść plik, aby wczytać dane</div>}
    </div>
  )
}
