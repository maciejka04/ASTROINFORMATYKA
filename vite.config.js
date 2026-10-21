import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function corsProxy() {
  return {
    name: 'cors-proxy',
    configureServer(server) {
      server.middlewares.use('/proxy', async (req, res) => {
        const target = new URL(req.url, 'http://localhost').searchParams.get('url')
        if (!target || !/^https?:\/\//i.test(target)) {
          res.statusCode = 400
          res.end('Podaj parametr ?url=http(s)://…')
          return
        }
        try {
          const upstream = await fetch(target, { headers: { 'user-agent': 'astro-histogram/0.1' } })
          res.statusCode = upstream.status
          res.setHeader('content-type', upstream.headers.get('content-type') ?? 'text/plain')
          res.end(Buffer.from(await upstream.arrayBuffer()))
        } catch (err) {
          res.statusCode = 502
          res.end(`Błąd proxy: ${err.message}`)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), corsProxy()],
  server: {
    port: 3000,
    strictPort: false,
    proxy: {
      '/api/exoplanets': {
        target: 'https://exoplanetarchive.ipac.caltech.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/exoplanets/, '/TAP/sync'),
      },
    },
  },
})
