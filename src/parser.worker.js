import { parseFile, parseText } from './data.js'
import { transferables } from './columns.js'

const PROGRESS_INTERVAL_MS = 100

self.onmessage = async ({ data }) => {
  let last = 0
  const onProgress = (fraction, rows) => {
    const now = performance.now()
    if (now - last < PROGRESS_INTERVAL_MS) return
    last = now
    self.postMessage({ type: 'progress', fraction, rows })
  }
  try {
    const result = data.file ? await parseFile(data.file, onProgress) : parseText(data.text, data.contentType, onProgress)
    self.postMessage({ type: 'done', result }, transferables(result))
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message })
  }
}
