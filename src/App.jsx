import { useCallback, useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import Histogram from './Histogram.jsx'
import RangeFilter from './RangeFilter.jsx'
import {
  DEFAULT_SOURCES, loadFromUrl, normalizeUrl, sourceLabel, numericColumns, columnValues, columnLabel,
} from './data.js'

const fmt = d3.format('.4~g')
const EMPTY = []
const STORAGE_KEY = 'astro-histogram-sources'

function loadSavedSources() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (Array.isArray(saved) && saved.length) return saved
  } catch {}
  return DEFAULT_SOURCES
}

export default function App() {
  const [sources, setSources] = useState(loadSavedSources)
  const [sourceId, setSourceId] = useState(() => sources[0]?.id ?? '')
  const [newUrl, setNewUrl] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sources)) } catch {}
  }, [sources])

  const addSource = (e) => {
    e.preventDefault()
    const url = normalizeUrl(newUrl)
    if (!url) return
    const existing = sources.find((s) => s.url === url)
    if (existing) {
      setSourceId(existing.id)
      setReloadKey((k) => k + 1)
    } else {
      const src = { id: crypto.randomUUID(), label: sourceLabel(url), url }
      setSources((list) => [...list, src])
      setSourceId(src.id)
    }
    setNewUrl('')
  }

  const removeSource = () => {
    const rest = sources.filter((s) => s.id !== sourceId)
    setSources(rest)
    setSourceId(rest[0]?.id ?? '')
  }

  const [result, setResult] = useState(null)
  const [tableIdx, setTableIdx] = useState(0)
  const [status, setStatus] = useState({ loading: false, error: null })

  const [column, setColumn] = useState('')
  const [binCount, setBinCount] = useState(40)
  const [logX, setLogX] = useState(false)
  const [range, setRange] = useState(null)

  const url = sources.find((s) => s.id === sourceId)?.url ?? ''

  useEffect(() => {
    if (!url) {
      setResult(null)
      return
    }
    let cancelled = false
    setStatus({ loading: true, error: null })
    loadFromUrl(url)
      .then((data) => {
        if (cancelled) return
        setResult(data)
        setTableIdx(0)
        setStatus({ loading: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setResult(null)
        setStatus({ loading: false, error: err.message })
      })
    return () => { cancelled = true }
  }, [url, reloadKey])

  const table = result?.tables[tableIdx]
  const rows = table?.rows ?? EMPTY
  const units = table?.units

  const columns = useMemo(() => numericColumns(rows), [rows])

  useEffect(() => {
    if (!columns.includes(column)) setColumn(columns.includes('pl_rade') ? 'pl_rade' : columns[0] ?? '')
  }, [columns, column])

  const label = (c) => columnLabel(c, units)

  const values = useMemo(() => {
    const v = column ? columnValues(rows, column) : []
    return logX ? v.filter((d) => d > 0) : v
  }, [rows, column, logX])

  const extent = useMemo(() => (values.length ? d3.extent(values) : null), [values])

  useEffect(() => setRange(null), [column, logX, rows])

  const activeRange = range ?? extent
  const filtered = useMemo(
    () => (activeRange ? values.filter((v) => v >= activeRange[0] && v <= activeRange[1]) : []),
    [values, activeRange]
  )

  const stats = useMemo(() => {
    if (!filtered.length) return null
    return {
      n: filtered.length,
      mean: d3.mean(filtered),
      median: d3.median(filtered),
      std: d3.deviation(filtered),
      min: d3.min(filtered),
      max: d3.max(filtered),
    }
  }, [filtered])

  const handleBrush = useCallback((r) => setRange(r), [])

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

          <label htmlFor="source">Źródło danych</label>
          <div className="url-form">
            <select id="source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={!sources.length}>
              {sources.map((s) => <option key={s.id} value={s.id} title={s.url}>{s.label}</option>)}
            </select>
            <button className="secondary" onClick={removeSource} disabled={!sourceId} title="Usuń źródło">✕</button>
          </div>
          <button className="secondary" onClick={() => setReloadKey((k) => k + 1)} disabled={!url || status.loading}>
            ↻ Odśwież dane
          </button>
          <small className="status">
            {status.loading && 'Ładowanie…'}
            {status.error && <span className="error">Błąd: {status.error}</span>}
            {!status.loading && !status.error && result &&
              `${result.format}${result.viaProxy ? ' (przez proxy)' : ''} · ${rows.length} wierszy, ${columns.length} kolumn liczbowych`}
          </small>
          {result?.tables.length > 1 && (
            <>
              <label htmlFor="table">Tabela w odpowiedzi</label>
              <select id="table" value={tableIdx} onChange={(e) => setTableIdx(+e.target.value)}>
                {result.tables.map((t, i) => <option key={t.name} value={i}>{t.name} ({t.rows.length} wierszy)</option>)}
              </select>
            </>
          )}
        </div>

        <div className="control">
          <label htmlFor="column">Kolumna</label>
          <select id="column" value={column} onChange={(e) => setColumn(e.target.value)} disabled={!columns.length}>
            {columns.map((c) => <option key={c} value={c}>{label(c)}{label(c) !== c ? ` (${c})` : ''}</option>)}
          </select>

          <label htmlFor="bins">Liczba przedziałów: {binCount}</label>
          <input id="bins" type="range" min={5} max={150} value={binCount} onChange={(e) => setBinCount(+e.target.value)} />

          <label className="checkbox">
            <input type="checkbox" checked={logX} onChange={(e) => setLogX(e.target.checked)} />
            Skala logarytmiczna osi X
          </label>
        </div>

        <div className="control">
          <label>Filtr zakresu</label>
          {extent && activeRange ? (
            <>
              <RangeFilter extent={extent} range={activeRange} logX={logX} onChange={setRange} />
              <button className="secondary" onClick={() => setRange(null)} disabled={!range}>
                Resetuj filtr
              </button>
              <small>Wskazówka: zaznacz zakres myszą na wykresie, aby go przybliżyć.</small>
            </>
          ) : <small>—</small>}
        </div>
      </section>

      <section className="panel">
        <Histogram
          values={filtered}
          domain={activeRange}
          binCount={binCount}
          logX={logX}
          xLabel={label(column)}
          onBrush={handleBrush}
        />
        {stats && (
          <dl className="stats">
            <div><dt>N</dt><dd>{stats.n} / {values.length}</dd></div>
            <div><dt>średnia</dt><dd>{fmt(stats.mean)}</dd></div>
            <div><dt>mediana</dt><dd>{fmt(stats.median)}</dd></div>
            <div><dt>odch. std.</dt><dd>{stats.std === undefined ? '—' : fmt(stats.std)}</dd></div>
            <div><dt>min</dt><dd>{fmt(stats.min)}</dd></div>
            <div><dt>max</dt><dd>{fmt(stats.max)}</dd></div>
          </dl>
        )}
      </section>

      {rows.length > 0 && (
        <details className="panel">
          <summary>Podgląd tabeli danych (pierwsze 20 wierszy)</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{Object.keys(rows[0]).map((k) => <th key={k} className={k === column ? 'active' : ''}>{k}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    {Object.keys(rows[0]).map((k) => <td key={k} className={k === column ? 'active' : ''}>{String(r[k] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
