import { notFound } from 'next/navigation'
import { getEvent, getEvents } from '@/lib/events'
import { EventDetail } from '@/components/EventDetail'

export async function generateStaticParams() {
  return (await getEvents()).map((event) => ({ slug: event.slug }))
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getEvent(slug)
  return {
    title: event ? `${event.title} | TicketNow` : 'Không tìm thấy sự kiện | TicketNow',
    description: event?.description.slice(0, 160),
  }
}
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) notFound()
  return <EventDetail event={event} />
}
