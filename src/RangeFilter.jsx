import { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'

const STEPS = 1000
const fmt = d3.format('.6~g')

function NumberField({ label, value, onCommit }) {
  const [draft, setDraft] = useState(fmt(value))
  useEffect(() => setDraft(fmt(value)), [value])

  const commit = () => {
    const n = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(n)) onCommit(n)
    else setDraft(fmt(value))
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  )
}

export default function RangeFilter({ extent, range, logX, onChange }) {
  const scale = useMemo(
    () => (logX ? d3.scaleLog() : d3.scaleLinear()).domain(extent).range([0, STEPS]).clamp(true),
    [extent, logX]
  )

  const [lo, hi] = range
  const clampToExtent = (v) => Math.min(Math.max(v, extent[0]), extent[1])

  const setLo = (v) => onChange([Math.min(clampToExtent(v), hi), hi])
  const setHi = (v) => onChange([lo, Math.max(clampToExtent(v), lo)])

  return (
    <div className="range-filter">
      <div className="sliders">
        <input
          type="range"
          min={0}
          max={STEPS}
          value={Math.round(scale(lo))}
          onChange={(e) => setLo(scale.invert(+e.target.value))}
        />
        <input
          type="range"
          min={0}
          max={STEPS}
          value={Math.round(scale(hi))}
          onChange={(e) => setHi(scale.invert(+e.target.value))}
        />
      </div>
      <div className="fields">
        <NumberField label="od" value={lo} onCommit={setLo} />
        <NumberField label="do" value={hi} onCommit={setHi} />
      </div>
    </div>
  )
}
