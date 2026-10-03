// Vercel sunucusuz fonksiyonu — tüm /api/* istekleri vercel.json'daki
// yeniden yazma kuralıyla buraya gelir. Asıl mantık server/ klasöründedir
// (VPS'e taşırken aynen kullanılır).
import { handleNode } from '../server/http.js'

export default function handler(req, res) {
  return handleNode(req, res)
}
