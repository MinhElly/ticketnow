import { getUploadedFile } from '@/lib/storage'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  try {
    const { slug } = await params
    const fileName = slug?.join('/')
    if (!fileName) {
      return new Response('Not Found', { status: 404 })
    }

    const file = await getUploadedFile(fileName)
    if (!file) {
      return new Response('File Not Found', { status: 404 })
    }

    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(file.buffer.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error serving upload file:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
