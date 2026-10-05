// ── VPS / BAĞIMSIZ SUNUCU ──
// Vercel dışında (kendi sunucunuzda) siteyi ve API'yi tek süreçte çalıştırır:
//   npm run build && npm start
// Gerekli ortam değişkenleri: DATABASE_URL, ADMIN_PIN (ya da ADMIN_PIN_HASH),
// isteğe bağlı PORT (varsayılan 3000) ve SESSION_SECRET.
// Önüne Nginx/Caddy ile HTTPS koymanız önerilir (X-Forwarded-Proto iletilmeli).
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { handleNode } from './http.js'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const PORT = Number(process.env.PORT || 3000)
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.woff2': 'font/woff2',
}
// vercel.json'daki güvenlik başlıklarının aynısı
const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(DIST, '../vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(vercelConfig.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]))

function sendFile(res, file, cache) {
  res.statusCode = 200
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
  res.setHeader('Cache-Control', cache)
  fs.createReadStream(file).pipe(res)
}

function resolveStatic(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '')
  const candidates = [path.join(DIST, clean), path.join(DIST, clean, 'index.html')]
  for (const f of candidates) {
    if (f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile()) return f
  }
  return null
}

http.createServer((req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
  const { pathname } = new URL(req.url, 'http://localhost')
  if (pathname === '/api' || pathname.startsWith('/api/')) return handleNode(req, res)
  // Site haritası veritabanından üretilir (vercel.json'daki rewrite ile aynı)
  if (pathname === '/sitemap.xml') { req.url = '/api/sitemap'; return handleNode(req, res) }
  if (/^\/google[a-z0-9]+\.html$/.test(pathname)) { req.url = `/api/gverify${pathname}`; return handleNode(req, res) }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end() }
  const file = resolveStatic(pathname)
  if (file) return sendFile(res, file, pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  // SPA: bilinmeyen yollar index.html'e düşer (vercel.json'daki rewrite ile aynı)
  return sendFile(res, path.join(DIST, 'index.html'), 'no-cache')
}).listen(PORT, () => console.log(`[ravun] http://localhost:${PORT} üzerinde çalışıyor`))
