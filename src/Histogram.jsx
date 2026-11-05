import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo } from 'react'
import * as d3 from 'd3'

const MARGIN = { top: 20, right: 24, bottom: 48, left: 60 }
const PLOT_HEIGHT = 352
const PANEL_MIN_HEIGHT = 90
const PANEL_GAP = 14
const LEGEND_ROW = 20
const fmt = d3.format('~g')

function legendLayout(series, width) {
  if (series.length < 2) return { items: [], height: 0 }
  const maxW = Math.max(width - MARGIN.left - MARGIN.right, 50)
  let x = 0
  let row = 0
  const items = series.map((s) => {
    const w = 26 + s.name.length * 7
    if (x > 0 && x + w > maxW) { x = 0; row++ }
    const item = { ...s, x, y: row * LEGEND_ROW }
    x += w
    return item
  })
  return { items, height: (row + 1) * LEGEND_ROW + 6 }
}

function barRects(series, edges, x, mode, y) {
  const rects = []
  const k = series.length
  for (let b = 0; b < edges.length - 1; b++) {
    const x0 = x(edges[b]) + 0.5
    const w = Math.max(0, x(edges[b + 1]) - x(edges[b]) - 1)
    let acc = 0
    series.forEach((s, i) => {
      const c = s.counts[b]
      if (mode === 'stacked') {
        rects.push({ bin: b, color: s.color, opacity: 0.9, x: x0, w, y0: y(acc), y1: y(acc + c) })
        acc += c
      } else if (mode === 'grouped') {
        const sw = w / k
        rects.push({ bin: b, color: s.color, opacity: 0.9, x: x0 + i * sw, w: Math.max(0, sw - (k > 1 ? 0.5 : 0)), y0: y(0), y1: y(c) })
      } else {
        rects.push({ bin: b, color: s.color, opacity: k > 1 ? 0.5 : 0.9, x: x0, w, y0: y(0), y1: y(c) })
      }
    })
  }
  return rects
}

const Histogram = forwardRef(function Histogram({ series, edges, mode, logX, xLabel, onBrush }, ref) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const [width, setWidth] = useState(800)
  const [tooltip, setTooltip] = useState(null)

  const panels = mode === 'panels' && series.length > 1
  const plotH = panels ? Math.max(PLOT_HEIGHT, series.length * (PANEL_MIN_HEIGHT + PANEL_GAP)) : PLOT_HEIGHT
  const legend = useMemo(() => legendLayout(series, width), [series, width])
  const height = MARGIN.top + legend.height + plotH + MARGIN.bottom
  const total = series.reduce((sum, s) => sum + s.counts.reduce((a, c) => a + c, 0), 0)

  useImperativeHandle(ref, () => ({
    exportSvg: () => {
      const svgElement = svgRef.current
      if (!svgElement) return
      let source = new XMLSerializer().serializeToString(svgElement)
      if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"')
      }
      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'histogram_astro.svg'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    },
  }))

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (!series.length || !edges || !total) return

    const innerW = Math.max(width - MARGIN.left - MARGIN.right, 50)
    const nBins = edges.length - 1
    const x = (logX ? d3.scaleLog() : d3.scaleLinear()).domain([edges[0], edges[nBins]]).range([0, innerW])

    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top - 6})`)
      .selectAll('g')
      .data(legend.items)
      .join('g')
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .call((item) => item.append('rect').attr('width', 12).attr('height', 12).attr('rx', 2).attr('fill', (d) => d.color))
      .call((item) => item.append('text').attr('class', 'legend-label').attr('x', 17).attr('y', 10).text((d) => d.name))

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top + legend.height})`)

    const panelHeight = panels ? (plotH - PANEL_GAP * (series.length - 1)) / series.length : plotH
    const panelList = panels
      ? series.map((s, i) => ({ top: i * (panelHeight + PANEL_GAP), series: [s] }))
      : [{ top: 0, series }]

    const rects = []
    for (const p of panelList) {
      const yMax = mode === 'stacked' && !panels
        ? d3.max(d3.range(nBins), (b) => d3.sum(p.series, (s) => s.counts[b]))
        : d3.max(p.series, (s) => d3.max(s.counts))
      const y = d3.scaleLinear().domain([0, yMax || 1]).nice().range([p.top + panelHeight, p.top])

      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(panels ? 3 : 6).tickSize(-innerW).tickFormat(''))
        .call((s) => s.select('.domain').remove())
      g.append('g').call(d3.axisLeft(y).ticks(panels ? 3 : 6, '~s'))
      if (panels) {
        g.append('text').attr('class', 'panel-label').attr('x', 6).attr('y', p.top + 12)
          .attr('fill', p.series[0].color).text(p.series[0].name)
      }
      rects.push(...barRects(p.series, edges, x, panels ? 'overlay' : mode, y))
    }

    const bars = g.append('g')
      .selectAll('rect')
      .data(rects)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', (d) => d.x)
      .attr('width', (d) => d.w)
      .attr('fill', (d) => d.color)
      .attr('fill-opacity', (d) => (panels ? 0.9 : d.opacity))
      .attr('y', (d) => d.y0)
      .attr('height', 0)

    bars.transition()
      .duration(300)
      .attr('y', (d) => d.y1)
      .attr('height', (d) => Math.max(0, d.y0 - d.y1))

    const xAxis = logX ? d3.axisBottom(x).ticks(8, '~g') : d3.axisBottom(x).ticks(Math.min(10, innerW / 80))
    g.append('g').attr('transform', `translate(0,${plotH})`).call(xAxis)

    g.append('text').attr('class', 'axis-label').attr('x', innerW).attr('y', plotH + 40)
      .attr('text-anchor', 'end').text(`${xLabel} →`)
    g.append('text').attr('class', 'axis-label').attr('x', -MARGIN.left + 4).attr('y', -8).text('↑ Liczebność')

    const brush = d3.brushX()
      .extent([[0, 0], [innerW, plotH]])
      .on('end', (event) => {
        if (!event.selection || !event.sourceEvent) return
        const [s0, s1] = event.selection.map(x.invert)
        g.select('.brush').call(brush.move, null)
        if (s1 > s0) onBrush([s0, s1])
      })
    const brushG = g.append('g').attr('class', 'brush').call(brush)

    brushG.select('.overlay')
      .on('mousemove', (event) => {
        const [mx, my] = d3.pointer(event, g.node())
        const v = x.invert(mx)
        const bin = Math.min(nBins - 1, Math.max(0, d3.bisectRight(edges, v) - 1))
        bars.classed('hover', (d) => d.bin === bin)
        setTooltip({
          left: mx + MARGIN.left,
          top: my + MARGIN.top + legend.height,
          title: `[${fmt(edges[bin])}, ${fmt(edges[bin + 1])})`,
          rows: series.map((s) => ({ name: s.name, color: s.color, count: s.counts[bin] })),
        })
      })
      .on('mouseleave', () => {
        bars.classed('hover', false)
        setTooltip(null)
      })
  }, [series, edges, mode, panels, plotH, legend, logX, xLabel, width, total, onBrush])

  return (
    <div className="chart" ref={wrapRef}>
      <svg ref={svgRef} width={width} height={height} />
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          <div>{tooltip.title}</div>
          {tooltip.rows.map((r) => (
            <div key={r.name}><span className="swatch" style={{ background: r.color }} />{r.name}: {r.count}</div>
          ))}
        </div>
      )}
      {!total && (
        <div className="empty">{series.length ? 'Brak danych w wybranym zakresie' : 'Wybierz co najmniej jedną kolumnę'}</div>
      )}
    </div>
  )
})

export default Histogram
