// Service worker for push reminders only. There is deliberately no fetch
// handler: the site is not cached offline, so a deploy is live on the next load
// and there is no stale-asset problem to manage.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // A payload we can't read still has to show something, or Chrome shows
    // its own "this site was updated in the background" notice instead.
  }

  const title = data.title || "Today's TapScape is ready"
  const options = {
    body: data.body || 'Five new places to find.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // One tag means a second push replaces the first rather than stacking.
    tag: data.tag || 'tapscape-daily',
    renotify: false,
    silent: true,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => new URL(c.url).origin === self.location.origin)
      if (open) return open.focus().then((c) => (c && 'navigate' in c ? c.navigate(url) : c))
      return self.clients.openWindow(url)
    }),
  )
})

// The push service rotated the subscription under us: resubscribe with the same
// server key and tell the Worker, so the reminder carries on uninterrupted.
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription
  const key = old?.options?.applicationServerKey
  if (!key) return
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((sub) =>
        fetch('/api/reminders/rotate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: sub.toJSON() }),
        }),
      ),
  )
})
