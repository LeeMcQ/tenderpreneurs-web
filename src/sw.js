// Service worker for Tenderpreneurs – caching strategies & offline features
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { BackgroundSyncPlugin } from 'workbox-background-sync'
import { clientsClaim } from 'workbox-core'

clientsClaim()
// Immediately claim any new clients
self.skipWaiting()

// ---------------------------------------------
// Precache the generated manifest + initial pages
precacheAndRoute(self.__WB_MANIFEST)

// Manually cache critical pages on install
self.addEventListener('install', (event) => {
  const urls = ['/', '/tenders', '/dashboard']
  event.waitUntil(
    caches.open('tenderpreneurs-v1').then((cache) => cache.addAll(urls))
  )
})

// Clean up old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== 'tenderpreneurs-v1')
          .map((key) => caches.delete(key))
      )
    })
  )
})

// ---------------------------------------------
// Routing strategies

// Static assets, icons, fonts → cache first
registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.url.includes('/icons/'),
  new CacheFirst({
    cacheName: 'tenderpreneurs-v1'
  })
)

// Tender listing pages → stale while revalidate
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/tenders') &&
    !url.pathname.startsWith('/api/'),
  new StaleWhileRevalidate({
    cacheName: 'tenderpreneurs-v1'
  })
)

// All /api/* GET requests → network only (never cache)
registerRoute(
  ({ request, url }) =>
    url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkOnly()
)

// All /api/* modification requests → network only + background sync
const bgSyncPlugin = new BackgroundSyncPlugin('tender-save-queue', {
  maxRetentionTime: 24 * 60 // Retry for up to 24 hours (in minutes)
})

registerRoute(
  ({ request, url }) =>
    url.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method),
  new NetworkOnly({
    plugins: [bgSyncPlugin]
  })
)

// ---------------------------------------------
// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  const title = data.title || 'New Tender Alert'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: data.tag || 'tender-alert',
    data: {
      url: data.url || '/dashboard/alerts'
    },
    actions: [
      { action: 'view', title: 'View Tender' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return
  // Default to 'view' (or direct click)
  const targetUrl = event.notification.data?.url || '/dashboard/alerts'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })
  )
})