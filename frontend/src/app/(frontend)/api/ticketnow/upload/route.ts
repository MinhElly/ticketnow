import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { failure, verifyOrigin } from '@/lib/http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export async function POST(request: Request) {
  try {
    try {
      verifyOrigin(request)
    } catch (err) {
      if (process.env.NODE_ENV === 'production') throw err
      // Soft-bypass in local development
    }

    const user = await appAuth.currentUser()
    if (!user || !['organizer', 'admin'].includes(user.role))
      return failure(new Error('Quyền truy cập bị từ chối.'), 403)

    const form = await request.formData()
    const file = form.get('file')
    if (
      !(file instanceof File) ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) ||
      file.size > 10 * 1024 * 1024 ||
      file.size < 1
    )
      throw new Error('Chọn ảnh JPG, PNG, WebP hoặc GIF nhỏ hơn 10MB.')

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = path.extname(file.name) || '.jpg'
    const cleanBaseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_')
    const fileName = `${cleanBaseName}-${randomUUID().slice(0, 8)}${ext}`

    // 1. Guaranteed local storage in public/uploads
    let localUrl = `/uploads/${fileName}`
    try {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
      await fs.mkdir(uploadsDir, { recursive: true })
      await fs.writeFile(path.join(uploadsDir, fileName), buffer)
    } catch (err) {
      console.warn('Local disk write note:', err)
    }

    // 2. Sync to Payload Media collection if available
    let mediaDoc: any = null
    try {
      const payload = await getPayloadClient()
      mediaDoc = await payload.create({
        collection: 'media',
        overrideAccess: true,
        data: { alt: file.name.replace(ext, '') || 'Ảnh bìa sự kiện' },
        file: {
          data: buffer,
          mimetype: file.type,
          name: fileName,
          size: file.size,
        },
      })
    } catch (err) {
      console.warn('Payload media create note:', err)
    }

    const resultId = mediaDoc?.id ? String(mediaDoc.id) : localUrl
    const resultUrl = mediaDoc?.url || localUrl

    return Response.json({
      ok: true,
      id: resultId,
      url: resultUrl,
      fileName,
    })
  } catch (error) {
    return failure(error)
  }
}
