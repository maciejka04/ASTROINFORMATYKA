import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

const MARGIN = { top: 20, right: 24, bottom: 48, left: 60 }
const HEIGHT = 420

function makeThresholds([lo, hi], count, logX) {
  if (logX) {
    const a = Math.log10(lo)
    const step = (Math.log10(hi) - a) / count
    return d3.range(1, count).map((i) => 10 ** (a + i * step))
  }
  const step = (hi - lo) / count
  return d3.range(1, count).map((i) => lo + i * step)
}

export default function Histogram({ values, domain, binCount, logX, xLabel, onBrush }) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const [width, setWidth] = useState(800)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (!values.length || !domain || !(domain[1] > domain[0])) return

    const innerW = Math.max(width - MARGIN.left - MARGIN.right, 50)
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom

    const x = (logX ? d3.scaleLog() : d3.scaleLinear()).domain(domain).range([0, innerW])

    const bins = d3.bin()
      .domain(domain)
      .thresholds(makeThresholds(domain, binCount, logX))(values)

    const y = d3.scaleLinear()
      .domain([0, d3.max(bins, (b) => b.length) || 1])
      .nice()
      .range([innerH, 0])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(''))
      .call((s) => s.select('.domain').remove())

    const bars = g.append('g')
      .selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.x0) + 0.5)
      .attr('width', (d) => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr('y', innerH)
      .attr('height', 0)

    bars.transition()
      .duration(400)
      .attr('y', (d) => y(d.length))
      .attr('height', (d) => innerH - y(d.length))

    const xAxis = logX ? d3.axisBottom(x).ticks(8, '~g') : d3.axisBottom(x).ticks(Math.min(10, innerW / 80))
    g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis)
    g.append('g').call(d3.axisLeft(y).ticks(6))

    g.append('text')
      .attr('class', 'axis-label')
      .attr('x', innerW)
      .attr('y', innerH + 40)
      .attr('text-anchor', 'end')
      .text(`${xLabel} →`)

    g.append('text')
      .attr('class', 'axis-label')
      .attr('x', -MARGIN.left + 4)
      .attr('y', -8)
      .text('↑ Liczebność')

    const brush = d3.brushX()
      .extent([[0, 0], [innerW, innerH]])
      .on('end', (event) => {
        if (!event.selection || !event.sourceEvent) return
        const [s0, s1] = event.selection.map(x.invert)
        g.select('.brush').call(brush.move, null)
        if (s1 > s0) onBrush([s0, s1])
      })

    const brushG = g.append('g').attr('class', 'brush').call(brush)

    const fmt = d3.format('~g')
    brushG.select('.overlay')
      .on('mousemove', (event) => {
        const [mx, my] = d3.pointer(event, g.node())
        const v = x.invert(mx)
        const bin = bins.find((b) => v >= b.x0 && v < b.x1) ?? bins[bins.length - 1]
        bars.classed('hover', (d) => d === bin)
        setTooltip({
          left: mx + MARGIN.left,
          top: my + MARGIN.top,
          text: `[${fmt(bin.x0)}, ${fmt(bin.x1)}): ${bin.length}`,
        })
      })
      .on('mouseleave', () => {
        bars.classed('hover', false)
        setTooltip(null)
      })
  }, [values, domain, binCount, logX, xLabel, width, onBrush])

  return (
    <div className="chart" ref={wrapRef}>
      <svg ref={svgRef} width={width} height={HEIGHT} />
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          {tooltip.text}
        </div>
      )}
      {!values.length && <div className="empty">Brak danych w wybranym zakresie</div>}
    </div>
  )
}
