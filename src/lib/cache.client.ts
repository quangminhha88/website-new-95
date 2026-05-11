/**
 * Browser-safe in-memory cache with TTL and SWR support.
 */

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

class ClientCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    if (this.cache.size >= 500) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Stale-While-Revalidate: return cached data immediately, refresh in background.
   */
  async swr<T>(key: string, fetcher: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await fetcher();
    this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}

export default new ClientCache();
