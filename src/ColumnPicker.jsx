import { useState } from 'react'

const SEARCH_THRESHOLD = 8

export default function ColumnPicker({ columns, selected, onChange, colorOf, label }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const visible = q ? columns.filter((c) => label(c).toLowerCase().includes(q)) : columns

  const toggle = (c) => onChange(selected.includes(c) ? selected.filter((s) => s !== c) : [...selected, c])

  return (
    <div className="column-picker">
      {columns.length > SEARCH_THRESHOLD && (
        <input type="text" placeholder="Szukaj kolumny…" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="column-list">
        {visible.map((c) => {
          const on = selected.includes(c)
          return (
            <label key={c} className="checkbox">
              <input type="checkbox" checked={on} onChange={() => toggle(c)} />
              <span className="swatch" style={{ background: on ? colorOf(c) : 'transparent' }} />
              {label(c)}
            </label>
          )
        })}
        {!visible.length && <small>—</small>}
      </div>
      <small>
        Wybrano: {selected.length}
        {selected.length > 0 && <button type="button" className="link" onClick={() => onChange([])}>wyczyść</button>}
      </small>
    </div>
  )
}
