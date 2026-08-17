import path from 'node:path';
import { canonicalMediaId, parseSeriesVideoId, sameMediaId } from './ids.js';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

function image(pathValue, size) {
  if (!pathValue) return undefined;
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  return `${TMDB_IMAGE_BASE}/${size}${pathValue.startsWith('/') ? '' : '/'}${pathValue}`;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function releaseInfo(item) {
  if (item.year) return String(item.year);
  const date = item.releaseDate || item.firstAirDate;
  return typeof date === 'string' && date.length >= 4 ? date.slice(0, 4) : undefined;
}

function moviePreview(movie) {
  return compact({
    id: canonicalMediaId(movie),
    type: 'movie',
    name: movie.title,
    poster: image(movie.posterPath, 'w500'),
    background: image(movie.backdropPath, 'original'),
    description: movie.overview || undefined,
    releaseInfo: releaseInfo(movie),
    genres: Array.isArray(movie.genres) ? movie.genres : undefined
  });
}

function seriesPreview(series) {
  return compact({
    id: canonicalMediaId(series),
    type: 'series',
    name: series.title,
    poster: image(series.posterPath, 'w500'),
    background: image(series.backdropPath, 'original'),
    description: series.overview || undefined,
    releaseInfo: releaseInfo(series),
    genres: Array.isArray(series.genres) ? series.genres : undefined
  });
}

function hasMovieFile(movie) {
  return movie.hasFile === true && Array.isArray(movie.files) && movie.files.some(isDownloadedFile);
}

function hasSeriesFile(series) {
  return Number(series.episodeFileCount || 0) > 0;
}

function isDownloadedFile(file) {
  return (
    file &&
    typeof file.relativePath === 'string' &&
    file.relativePath.length > 0 &&
    !file.relativePath.toLowerCase().endsWith('.strm')
  );
}

function isoDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function compareNewest(left, right) {
  return String(right.added || '').localeCompare(String(left.added || ''));
}

function matchesSearch(item, search) {
  if (!search) return true;
  const needle = search.toLocaleLowerCase();
  return [item.title, item.originalTitle, item.year]
    .filter((value) => value !== null && value !== undefined)
    .some((value) => String(value).toLocaleLowerCase().includes(needle));
}

export class MediaLibrary {
  constructor(client) {
    this.client = client;
  }

  async catalog(type, { skip = 0, search = '', pageSize = 50 } = {}) {
    const library = await this.client.getLibrary();
    const source = type === 'movie' ? library.movies : library.series;
    const present = source
      .filter(type === 'movie' ? hasMovieFile : hasSeriesFile)
      .filter((item) => matchesSearch(item, search))
      .sort(compareNewest)
      .slice(skip, skip + pageSize);
    return present.map(type === 'movie' ? moviePreview : seriesPreview);
  }

  async findMovie(id) {
    const { movies } = await this.client.getLibrary();
    return movies.find((movie) => sameMediaId(movie, id) && hasMovieFile(movie)) || null;
  }

  async findSeries(id) {
    const { series } = await this.client.getLibrary();
    return series.find((item) => sameMediaId(item, id) && hasSeriesFile(item)) || null;
  }

  async movieMeta(id) {
    const movie = await this.findMovie(id);
    if (!movie) return null;
    return {
      ...moviePreview(movie),
      runtime: Number.isFinite(movie.runtime) ? `${movie.runtime} min` : undefined
    };
  }

  async seriesMeta(id) {
    const series = await this.findSeries(id);
    if (!series) return null;
    const detail = await this.client.getSeriesDetail(series.id);
    const canonicalId = canonicalMediaId(series);
    const videos = [];

    for (const season of detail.seasons || []) {
      for (const episode of season.episodes || []) {
        if (!isDownloadedFile(episode.file)) continue;
        videos.push(
          compact({
            id: `${canonicalId}:${episode.seasonNumber}:${episode.episodeNumber}`,
            title: episode.title || `Episode ${episode.episodeNumber}`,
            season: episode.seasonNumber,
            episode: episode.episodeNumber,
            released: isoDate(episode.airDate),
            overview: episode.overview || undefined,
            thumbnail: image(episode.stillPath, 'w780')
          })
        );
      }
    }

    return {
      ...seriesPreview(series),
      videos
    };
  }

  async resolveMovieFile(mediaId, fileId) {
    const movie = await this.findMovie(mediaId);
    if (!movie) return null;
    const file = movie.files.find(
      (candidate) => isDownloadedFile(candidate) && String(candidate.id) === String(fileId)
    );
    return file ? { type: 'movie', item: movie, file } : null;
  }

  async resolveEpisodeFile(videoId, fileId) {
    const parsed = parseSeriesVideoId(videoId);
    if (parsed.season === null || parsed.episode === null) return null;
    const series = await this.findSeries(parsed.mediaId);
    if (!series) return null;
    const detail = await this.client.getSeriesDetail(series.id);
    const episode = (detail.seasons || [])
      .flatMap((season) => season.episodes || [])
      .find(
        (candidate) =>
          candidate.seasonNumber === parsed.season &&
          candidate.episodeNumber === parsed.episode &&
          isDownloadedFile(candidate.file) &&
          String(candidate.file.id) === String(fileId)
      );
    return episode ? { type: 'series', item: detail, episode, file: episode.file } : null;
  }

  async movieStreams(id, makeUrl, isAvailable = async () => true) {
    const movie = await this.findMovie(id);
    if (!movie) return [];
    const streams = [];
    for (const file of movie.files.filter(isDownloadedFile)) {
      if (await isAvailable(movie, file)) {
        streams.push(this.#stream(movie, file, makeUrl, 'movie', id));
      }
    }
    return streams;
  }

  async episodeStreams(videoId, makeUrl, isAvailable = async () => true) {
    const parsed = parseSeriesVideoId(videoId);
    if (parsed.season === null || parsed.episode === null) return [];
    const series = await this.findSeries(parsed.mediaId);
    if (!series) return [];
    const detail = await this.client.getSeriesDetail(series.id);
    const episode = (detail.seasons || [])
      .flatMap((season) => season.episodes || [])
      .find(
        (candidate) =>
          candidate.seasonNumber === parsed.season && candidate.episodeNumber === parsed.episode
      );
    if (!isDownloadedFile(episode?.file) || !(await isAvailable(detail, episode.file))) return [];
    return [this.#stream(detail, episode.file, makeUrl, 'series', videoId)];
  }

  #stream(item, file, makeUrl, type, mediaId) {
    const mediaInfo = file.mediaInfo && typeof file.mediaInfo === 'object' ? file.mediaInfo : {};
    const quality =
      (typeof file.quality === 'string' ? file.quality : null) ||
      file.quality?.resolution ||
      file.quality?.quality ||
      mediaInfo.resolution ||
      'Local';
    const size = Number(file.size) || undefined;
    const filename = path.posix.basename(String(file.relativePath).replaceAll('\\', '/'));
    const details = [quality, size ? formatBytes(size) : null, file.edition]
      .filter(Boolean)
      .join(' • ');
    return compact({
      name: 'Cinephage',
      title: details || 'Local file',
      description: filename,
      url: makeUrl({ type, mediaId, fileId: file.id }),
      behaviorHints: compact({
        notWebReady: true,
        bingeGroup: `cinephage-${canonicalMediaId(item)}`,
        filename,
        videoSize: size
      })
    });
  }
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}
