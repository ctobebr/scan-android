const cache = new Map()
const MAX_SIZE = 5

export function setPanoramaCache(key, dataUri) {
  if (cache.size >= MAX_SIZE) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
  cache.set(key, dataUri)
  console.log('[PanoramaCache] 缓存全景图:', key.substring(0, 50), `(共${cache.size}条)`)
}

export function getPanoramaCache(key) {
  return cache.get(key) || null
}

export function hasPanoramaCache(key) {
  return cache.has(key)
}

export function clearPanoramaCache() {
  cache.clear()
}