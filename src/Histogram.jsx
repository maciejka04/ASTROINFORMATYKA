import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import * as d3 from 'd3'

const MARGIN = { top: 20, right: 24, bottom: 48, left: 60 }
const HEIGHT = 420

// 1. Algorytm automatycznego doboru binów (Reguła Freedmana–Diaconisa)
export function calculateAutomaticBins(values, domain, logX) {
  if (!values || values.length < 2) return 30
  
  // Jeśli skala logarytmiczna, operujemy na logarytmach
  const data = logX ? values.map(v => Math.log10(v)) : values
  const sorted = [...data].sort((a, b) => a - b)
  
  const q1 = d3.quantile(sorted, 0.25)
  const q3 = d3.quantile(sorted, 0.75)
  const iqr = q3 - q1
  
  if (!iqr || iqr === 0) return 30 // Awaryjnie jakby dane były identyczne
  
  const n = sorted.length
  const h = 2 * iqr * Math.pow(n, -1/3) // Szerokość binu wg F-D
  
  const rangeSpan = domain[1] - domain[0]
  const count = Math.round(rangeSpan / h)
  
  // Ograniczamy liczbę binów w rozsądnych granicach (np. od 5 do 200)
  return Math.min(Math.max(count, 5), 200)
}

function makeThresholds([lo, hi], count, logX) {
  if (logX) {
    const a = Math.log10(lo)
    const step = (Math.log10(hi) - a) / count
    return d3.range(1, count).map((i) => 10 ** (a + i * step))
  }
  const step = (hi - lo) / count
  return d3.range(1, count).map((i) => lo + i * step)
}

const Histogram = forwardRef(function Histogram({ values, domain, binCount, autoBins, logX, xLabel, onBrush }, ref) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const [width, setWidth] = useState(800)
  const [tooltip, setTooltip] = useState(null)

  // 2. Eksport SVG udostępniony na zewnątrz przez ref
  useImperativeHandle(ref, () => ({
    exportSvg: () => {
      const svgElement = svgRef.current
      if (!svgElement) return
      
      const serializer = new XMLSerializer()
      let source = serializer.serializeToString(svgElement)
      
      // Dodajemy namespace XML, żeby plik SVG był poprawny dla przeglądarki/zewnętrznych programów
      if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      
      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'histogram_astro.svg'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }))

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

    // Wybieramy liczbę binów: albo sztywną z suwaka, albo wyliczoną automatycznie
    const effectiveBins = autoBins ? calculateAutomaticBins(values, domain, logX) : binCount

    const bins = d3.bin()
      .domain(domain)
      .thresholds(makeThresholds(domain, effectiveBins, logX))(values)

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
  }, [values, domain, binCount, autoBins, logX, xLabel, width, onBrush])

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
})

export default Histogram