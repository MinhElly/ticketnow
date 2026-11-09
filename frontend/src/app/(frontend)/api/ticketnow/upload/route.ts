import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { failure, verifyOrigin } from '@/lib/http'

export async function POST(request: Request) {
  try {
    verifyOrigin(request)
    const user = await appAuth.currentUser()
    if (!user || !['organizer', 'admin'].includes(user.role))
      return failure(new Error('Quyền truy cập bị từ chối.'), 403)
    const form = await request.formData()
    const file = form.get('file')
    if (
      !(file instanceof File) ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 8 * 1024 * 1024 ||
      file.size < 1
    )
      throw new Error('Chọn ảnh JPG, PNG hoặc WebP nhỏ hơn 8MB.')
    const payload = await getPayloadClient()
    const media = await payload.create({
      collection: 'media',
      user,
      overrideAccess: false,
      data: { alt: 'Ảnh bìa sự kiện' },
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        name: file.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
        size: file.size,
      },
    })
    return Response.json({ ok: true, id: media.id, url: media.url })
  } catch (error) {
    return failure(error)
  }
}
