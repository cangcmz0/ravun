// ── VERİTABANI (PostgreSQL) ──
// Standart Postgres kullanılır: Vercel'de Neon, VPS'te kendi kurduğunuz
// Postgres — kod aynı, yalnızca DATABASE_URL değişir.
import pg from 'pg'
import { createRequire } from 'module'
import { sanitizeProduct } from './sanitize.js'

const require = createRequire(import.meta.url)
const PRODUCT_SEED = require('../src/data/products.json')
const REVIEW_SEED = require('./seed-reviews.json')

export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || ''
}

let pool = null
let ready = null

function getPool() {
  if (!pool) {
    const connectionString = databaseUrl()
    if (!connectionString) {
      const err = new Error('DATABASE_URL tanımlı değil')
      err.status = 503
      throw err
    }
    pool = new pg.Pool({
      connectionString,
      // Sunucusuz ortamda (Vercel) her örnek az bağlantı açmalı.
      max: Number(process.env.PG_POOL_MAX || 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    })
    pool.on('error', (err) => console.error('[db] havuz hatası:', err.message))
  }
  return pool
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id integer PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
  id bigserial PRIMARY KEY,
  order_no text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
CREATE TABLE IF NOT EXISTS reviews (
  id bigserial PRIMARY KEY,
  product_id integer NOT NULL,
  name text NOT NULL,
  rating smallint NOT NULL,
  text text NOT NULL,
  helpful integer NOT NULL DEFAULT 0,
  approved boolean NOT NULL DEFAULT false,
  date_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews (product_id);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_at timestamptz;
CREATE TABLE IF NOT EXISTS messages (
  id bigserial PRIMARY KEY,
  data jsonb NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS images (
  id text PRIMARY KEY,
  mime text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customers (
  id bigserial PRIMARY KEY,
  google_sub text UNIQUE NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  picture text,
  phone text,
  favorites jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders ((data->>'customerId'));
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL
);
`

async function init() {
  const p = getPool()
  await p.query(SCHEMA)
  // İlk kurulumda örnek ürün ve yorumları yükle (yalnızca bir kez; sonradan
  // tüm ürünler silinse bile tekrar yüklenmez).
  const seeded = await p.query("SELECT 1 FROM settings WHERE key = 'seeded'")
  if (seeded.rowCount === 0) {
    const client = await p.connect()
    try {
      await client.query('BEGIN')
      for (const raw of PRODUCT_SEED) {
        const prod = sanitizeProduct(raw)
        if (prod) await client.query('INSERT INTO products (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [prod.id, prod])
      }
      for (const [pid, list] of Object.entries(REVIEW_SEED)) {
        for (const r of list) {
          await client.query(
            'INSERT INTO reviews (product_id, name, rating, text, helpful, approved, date_label) VALUES ($1,$2,$3,$4,$5,true,$6)',
            [Number(pid), r.name, r.rating, r.text, r.helpful || 0, r.date || null],
          )
        }
      }
      await client.query("INSERT INTO settings (key, data) VALUES ('seeded', 'true'::jsonb) ON CONFLICT DO NOTHING")
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
}

export async function db() {
  const p = getPool()
  if (!ready) ready = init().catch((err) => { ready = null; throw err })
  await ready
  return p
}

export async function tx(fn) {
  const p = await db()
  const client = await p.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
