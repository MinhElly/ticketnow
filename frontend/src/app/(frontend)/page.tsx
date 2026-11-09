import { getEvents } from '@/lib/events'
import { Explore } from '@/components/Explore'

export default async function HomePage() {
  const events = await getEvents()
  return <Explore events={events} />
}
