const CACHE_NAME = "basic-planner-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];


/* ------------------------------------------------------------
   INSTALL
------------------------------------------------------------ */

self.addEventListener("install", event => {

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(APP_FILES);
      })

  );

  self.skipWaiting();
});


/* ------------------------------------------------------------
   ACTIVATE
------------------------------------------------------------ */

self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys()
      .then(cacheNames => {

        return Promise.all(

          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))

        );

      })

  );

  self.clients.claim();
});


/* ------------------------------------------------------------
   FETCH
------------------------------------------------------------ */

self.addEventListener("fetch", event => {

  /*
    API requests for Google Calendar and weather should
    continue going directly to the internet.

    The app's own files are served from the cache first.
  */

  const requestUrl =
    new URL(event.request.url);

  const isApiRequest =
    requestUrl.hostname.includes("googleapis.com") ||
    requestUrl.hostname.includes("open-meteo.com");

  if (isApiRequest) {
    return;
  }


  event.respondWith(

    caches.match(event.request)
      .then(cachedResponse => {

        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request);

      })

  );
});
