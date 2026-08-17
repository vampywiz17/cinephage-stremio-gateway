export class CinephageError extends Error {
  constructor(message, status = 502, cause) {
    super(message, { cause });
    this.name = 'CinephageError';
    this.status = status;
  }
}

function assertArray(value, field) {
  if (!Array.isArray(value)) {
    throw new CinephageError(`Unexpected Cinephage response: ${field} is not an array`);
  }
  return value;
}

export class CinephageClient {
  #config;
  #logger;
  #libraryCache = null;
  #libraryInFlight = null;
  #seriesCache = new Map();
  #seriesInFlight = new Map();

  constructor(config, logger) {
    this.#config = config;
    this.#logger = logger;
  }

  async #request(pathname) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.cinephageTimeoutMs);
    try {
      const response = await fetch(`${this.#config.cinephageUrl}${pathname}`, {
        headers: {
          accept: 'application/json',
          'x-api-key': this.#config.apiKey,
          'user-agent': 'cinephage-nuvio-bridge/0.1'
        },
        signal: controller.signal
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new CinephageError(
          `Cinephage returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
          response.status === 401 || response.status === 403 ? 503 : 502
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof CinephageError) throw error;
      if (error?.name === 'AbortError') {
        throw new CinephageError('Cinephage request timed out', 504, error);
      }
      throw new CinephageError('Unable to reach Cinephage', 502, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async getLibrary({ force = false } = {}) {
    const now = Date.now();
    if (!force && this.#libraryCache?.expiresAt > now) return this.#libraryCache.value;
    if (this.#libraryInFlight) return this.#libraryInFlight;

    this.#libraryInFlight = Promise.all([
      this.#request('/api/library/movies'),
      this.#request('/api/library/series')
    ])
      .then(([movieResponse, seriesResponse]) => {
        const value = {
          movies: assertArray(movieResponse.movies, 'movies'),
          series: assertArray(seriesResponse.series, 'series')
        };
        this.#libraryCache = {
          value,
          expiresAt: Date.now() + this.#config.libraryCacheTtlMs
        };
        this.#logger.debug('Cinephage library refreshed', {
          movies: value.movies.length,
          series: value.series.length
        });
        return value;
      })
      .finally(() => {
        this.#libraryInFlight = null;
      });

    return this.#libraryInFlight;
  }

  async getSeriesDetail(internalId, { force = false } = {}) {
    const now = Date.now();
    const cached = this.#seriesCache.get(internalId);
    if (!force && cached?.expiresAt > now) return cached.value;
    if (this.#seriesInFlight.has(internalId)) return this.#seriesInFlight.get(internalId);

    const request = this.#request(`/api/library/series/${encodeURIComponent(internalId)}`)
      .then((response) => {
        if (!response.series || typeof response.series !== 'object') {
          throw new CinephageError('Unexpected Cinephage response: series is missing');
        }
        this.#seriesCache.set(internalId, {
          value: response.series,
          expiresAt: Date.now() + this.#config.seriesCacheTtlMs
        });
        return response.series;
      })
      .finally(() => this.#seriesInFlight.delete(internalId));

    this.#seriesInFlight.set(internalId, request);
    return request;
  }

  clearCaches() {
    this.#libraryCache = null;
    this.#seriesCache.clear();
  }
}
