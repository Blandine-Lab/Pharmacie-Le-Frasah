// frontend/public/sw.js

// Version du cache
const CACHE_VERSION = 'v2';
const CACHE_NAME = `mce-cache-${CACHE_VERSION}`;

// Fichiers à mettre en cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/logo.jpeg',
  '/favicon.ico',
  // Les fichiers JS et CSS seront ajoutés dynamiquement
];

// Installation : mise en cache des assets
self.addEventListener('install', (event) => {
  console.log('📦 Service Worker : Installation');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Mise en cache des assets...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker : Activation');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log(`🗑️ Suppression de l\'ancien cache : ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Interception des requêtes
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes API
  if (url.pathname.startsWith('/api/')) {
    // Stratégie : Network First (priorité réseau)
    event.respondWith(
      fetch(request)
        .catch(() => {
          // En cas d'échec, retourner une erreur
          return new Response(
            JSON.stringify({ error: 'Mode hors ligne - API non disponible' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Pour les assets statiques : Cache First
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Mettre à jour le cache en arrière-plan
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        // Si pas en cache, aller chercher sur le réseau
        return fetch(request).then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clonedResponse);
          });
          return response;
        }).catch(() => {
          // Fallback si tout échoue
          return new Response('Contenu indisponible hors ligne', { status: 404 });
        });
      })
  );
});

// Synchronisation en arrière-plan
self.addEventListener('sync', (event) => {
  console.log('🔄 Service Worker : Sync', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

// Fonction de synchronisation
async function syncData() {
  console.log('🔄 Début synchronisation...');
  try {
    // Envoyer un message au client pour lancer la synchronisation
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_START'
      });
    });

    // La synchronisation réelle est gérée par le client (React)
    // car IndexedDB est plus facilement accessible depuis le main thread

    return true;
  } catch (error) {
    console.error('❌ Erreur synchronisation:', error);
    return false;
  }
}

// Gestion des messages du client
self.addEventListener('message', (event) => {
  console.log('📨 Message reçu SW:', event.data);
  if (event.data && event.data.type === 'PING') {
    event.ports[0].postMessage({ type: 'PONG' });
  }
});
