import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'

export function getUploadDirectories(): string[] {
  const cwd = process.cwd()
  return [
    path.join(cwd, 'frontend', 'public', 'uploads'),
    path.join(cwd, 'public', 'uploads'),
    path.resolve(cwd, '..', 'frontend', 'public', 'uploads'),
    path.resolve(cwd, '..', 'public', 'uploads'),
  ]
}

export async function saveUploadedFile(fileName: string, buffer: Buffer): Promise<string> {
  const dirs = getUploadDirectories()
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, fileName), buffer)
    } catch {
      // Non-blocking
    }
  }
  return `/uploads/${fileName}`
}

export async function getUploadedFile(
  fileName: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const cleanFileName = path.basename(fileName)
  const dirs = getUploadDirectories()

  for (const dir of dirs) {
    const filePath = path.join(dir, cleanFileName)
    if (fsSync.existsSync(filePath)) {
      try {
        const buffer = await fs.readFile(filePath)
        const ext = path.extname(cleanFileName).toLowerCase()
        const mimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.avif': 'image/avif',
          '.ico': 'image/x-icon',
        }
        return {
          buffer,
          mimeType: mimeMap[ext] || 'image/jpeg',
        }
      } catch {
        // Try next directory
      }
    }
  }

  return null
}
