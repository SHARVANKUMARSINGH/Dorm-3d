// Device Storage Asset Cache using Browser Cache API
// Automatically saves 3D models to local device storage on first download
// so future page visits load instantly with 0 network usage!

const CACHE_NAME = 'dorm3d-asset-cache-v1';

export class AssetCache {
  static isCached(url) {
    if (!('caches' in window)) return Promise.resolve(false);
    return caches.open(CACHE_NAME).then(cache => cache.match(url).then(res => !!res)).catch(() => false);
  }

  static async loadArrayBuffer(url, onStatus) {
    // 1. Try to retrieve from Browser Cache Storage
    if ('caches' in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(url);
        if (cachedResponse) {
          if (onStatus) onStatus(`⚡ Device storage: ${url.split('/').pop()}`);
          return await cachedResponse.arrayBuffer();
        }
      } catch (e) {
        console.warn('[AssetCache] Cache match error, falling back to network:', e);
      }
    }

    // 2. Fetch from network and save to device storage
    if (onStatus) onStatus(`📥 Downloading & saving to device storage: ${url.split('/').pop()}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }

    // Clone response so we can store it in cache and return arrayBuffer
    const responseClone = response.clone();
    const arrayBuffer = await response.arrayBuffer();

    // Store in Cache Storage in background
    if ('caches' in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url, responseClone);
      } catch (e) {
        console.warn('[AssetCache] Failed to store in cache:', e);
      }
    }

    return arrayBuffer;
  }
}
