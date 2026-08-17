export function canonicalMediaId(item) {
  if (typeof item.imdbId === 'string' && /^tt\d+$/i.test(item.imdbId)) {
    return item.imdbId.toLowerCase();
  }
  return `tmdb:${item.tmdbId}`;
}

export function sameMediaId(item, requestedId) {
  const normalized = requestedId.toLowerCase();
  return (
    canonicalMediaId(item).toLowerCase() === normalized ||
    `tmdb:${item.tmdbId}` === normalized ||
    String(item.tmdbId) === normalized
  );
}

export function parseSeriesVideoId(value) {
  const match = /^(.*):(\d+):(\d+)$/.exec(value);
  if (!match) return { mediaId: value, season: null, episode: null };
  return {
    mediaId: match[1],
    season: Number.parseInt(match[2], 10),
    episode: Number.parseInt(match[3], 10)
  };
}
