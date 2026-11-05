import { fetchText } from './data.js'

function parseInWorker(payload, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parser.worker.js', import.meta.url), { type: 'module' })
    const stop = () => { worker.terminate(); reject(new DOMException('Przerwano', 'AbortError')) }
    signal?.addEventListener('abort', stop, { once: true })
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return onProgress?.(data)
      signal?.removeEventListener('abort', stop)
      worker.terminate()
      if (data.type === 'done') resolve(data.result)
      else reject(new Error(data.message))
    }
    worker.onerror = (e) => {
      signal?.removeEventListener('abort', stop)
      worker.terminate()
      reject(new Error(e.message || 'Błąd parsera'))
    }
    worker.postMessage(payload)
  })
}

export async function loadUrl(url, onProgress, signal) {
  const { text, contentType, viaProxy } = await fetchText(url)
  if (signal?.aborted) throw new DOMException('Przerwano', 'AbortError')
  const result = await parseInWorker({ text, contentType }, onProgress, signal)
  return { ...result, viaProxy }
}

export const loadFile = (file, onProgress, signal) => parseInWorker({ file }, onProgress, signal)
