import 'server-only'
import mysql from 'mysql2/promise'

const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = Number(process.env.DB_PORT) || 3307
const DB_USER = process.env.DB_ROOT_USERNAME || 'root'
const DB_PASSWORD = process.env.DB_ROOT_PASSWORD || 'ticketnow'
const DB_NAME = process.env.EVENT_DB_NAME || 'ticketnow_event'

let pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 3000,
    })
  }
  return pool
}

export async function syncEventToMariaDB({
  id,
  title,
  description,
  venueId,
  startsAt,
  endsAt,
  category,
  imageUrl,
  slug,
  status = 'ON_SALE',
}: {
  id: string
  title: string
  description?: string
  venueId?: string
  startsAt: string
  endsAt: string
  category?: string
  imageUrl?: string
  slug?: string
  status?: string
}) {
  try {
    const p = getPool()
    const [rows]: any = await p.execute('SELECT id FROM events WHERE id = ?', [id])
    if (rows && rows.length > 0) {
      await p.execute(
        `UPDATE events 
         SET title = COALESCE(?, title),
             description = COALESCE(?, description),
             category = COALESCE(?, category),
             image_url = ?,
             starts_at = COALESCE(?, starts_at),
             ends_at = COALESCE(?, ends_at),
             updated_at = NOW()
         WHERE id = ?`,
        [title, description || null, category || null, imageUrl || null, startsAt, endsAt, id],
      )
    } else {
      const vid = venueId || 'aa632f5a-2038-44f2-b451-8b4cfb0c509c'
      const s = slug || `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 8)}`
      await p.execute(
        `INSERT INTO events (id, title, description, venue_id, organizer_id, starts_at, ends_at, status, slug, category, image_url, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'system', ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
        [
          id,
          title,
          description || null,
          vid,
          startsAt,
          endsAt,
          status,
          s,
          category || null,
          imageUrl || null,
        ],
      )
    }
    return true
  } catch (err) {
    console.warn('[MariaDB] Direct sync note:', err)
    return false
  }
}
