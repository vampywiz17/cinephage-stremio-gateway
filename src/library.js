import path from 'node:path';
import { canonicalMediaId, parseSeriesVideoId, sameMediaId } from './ids.js';
import { isStrmPath } from './strm.js';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

function image(pathValue, size) {
  if (!pathValue) return undefined;
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  return `${TMDB_IMAGE_BASE}/${size}${pathValue.startsWith('/') ? '' : '/'}${pathValue}`;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function knownText(value) {
  const result = text(value);
  return result && !['unknown', 'n/a', 'none'].includes(result.toLowerCase()) ? result : undefined;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatSource(value) {
  const source = knownText(value);
  if (!source) return undefined;
  const normalized = source.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  return (
    {
      bluray: 'BluRay',
      webdl: 'WEB-DL',
      webrip: 'WEBRip',
      hdtv: 'HDTV',
      dvd: 'DVD',
      remux: 'Remux'
    }[normalized] || source
  );
}

function formatCodec(value) {
  const codec = knownText(value);
  if (!codec) return undefined;
  return (
    {
      h264: 'H.264',
      avc: 'H.264',
      h265: 'HEVC',
      hevc: 'HEVC',
      x264: 'H.264',
      x265: 'HEVC',
      av1: 'AV1',
      vp9: 'VP9'
    }[codec.toLowerCase().replaceAll(/[^a-z0-9]/g, '')] || codec
  );
}

function formatHdr(value) {
  const hdr = knownText(value);
  if (!hdr) return undefined;
  const tags = [];
  if (/dolby[\s-]*vision|\bdv\b/i.test(hdr)) tags.push('Dolby Vision');
  if (/hdr10\+/i.test(hdr)) tags.push('HDR10+');
  else if (/hdr10/i.test(hdr)) tags.push('HDR10');
  else if (/\bhdr\b/i.test(hdr)) tags.push('HDR');
  if (/\bhlg\b/i.test(hdr)) tags.push('HLG');
  return tags.length ? unique(tags).join(', ') : hdr;
}

function formatChannels(value) {
  const channels = Number(value);
  if (!Number.isFinite(channels) || channels <= 0) return undefined;
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  if (channels === 6) return '5.1';
  if (channels === 8) return '7.1';
  return `${channels}ch`;
}

function formatLanguages(values) {
  if (!Array.isArray(values)) return undefined;
  const languages = unique(
    values.map((value) => text(value)?.toUpperCase()).filter((value) => value && value !== 'UND')
  );
  return languages.length ? languages.join('/') : undefined;
}

function formatBitrate(size, runtime) {
  const bytes = Number(size);
  const seconds = Number(runtime);
  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return `${((bytes * 8) / seconds / 1_000_000).toFixed(1)} Mbps`;
}

function technicalDescription(file, filename, strm = false) {
  const quality = file.quality && typeof file.quality === 'object' ? file.quality : {};
  const mediaInfo = file.mediaInfo && typeof file.mediaInfo === 'object' ? file.mediaInfo : {};
  const resolution =
    (typeof file.quality === 'string' ? knownText(file.quality) : undefined) ||
    knownText(quality.resolution) ||
    (Number(mediaInfo.height) > 0 ? `${Number(mediaInfo.height)}p` : undefined);
  const source = formatSource(quality.source);
  const codec = formatCodec(mediaInfo.videoCodec || quality.codec);
  const profile = knownText(mediaInfo.videoProfile);
  const bitDepth = Number(mediaInfo.videoBitDepth);
  const video = unique([
    codec,
    profile,
    !profile && Number.isFinite(bitDepth) && bitDepth > 0 ? `${bitDepth}-bit` : undefined
  ]).join(' ');
  const hdr = formatHdr(mediaInfo.videoHdrFormat || quality.hdr);
  const audioCodec = knownText(mediaInfo.audioCodec);
  const audioChannels = formatChannels(mediaInfo.audioChannels);
  const audioLanguages = formatLanguages(mediaInfo.audioLanguages);
  const subtitleLanguages = formatLanguages(mediaInfo.subtitleLanguages);
  const bitrate = strm ? undefined : formatBitrate(file.size, mediaInfo.runtime);
  const size = !strm && Number(file.size) > 0 ? formatBytes(Number(file.size)) : undefined;

  const playback = unique([
    strm ? 'STRM' : 'Direct Play',
    resolution,
    source,
    video || undefined,
    hdr,
    knownText(file.edition)
  ]).join(' • ');
  const audio = unique([audioCodec, audioChannels, audioLanguages]).join(' ');
  const media = [
    bitrate,
    audio ? `Audio: ${audio}` : undefined,
    subtitleLanguages ? `Subtitles: ${subtitleLanguages}` : undefined,
    size,
    knownText(file.releaseGroup)
  ]
    .filter(Boolean)
    .join(' • ');

  return [filename, playback || undefined, media || undefined].filter(Boolean).join('\n');
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
  return movie.hasFile === true && Array.isArray(movie.files) && movie.files.some(isPlayableFile);
}

function hasSeriesFile(series) {
  return Number(series.episodeFileCount || 0) > 0;
}

function isPlayableFile(file) {
  return file && typeof file.relativePath === 'string' && file.relativePath.length > 0;
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
        videos.push(
          compact({
            id: `${canonicalId}:${episode.seasonNumber}:${episode.episodeNumber}`,
            title: episode.title || `Episode ${episode.episodeNumber}`,
            season: episode.seasonNumber,
            episode: episode.episodeNumber,
            released:
              isoDate(
                episode.airDate ||
                  episode.file?.dateAdded ||
                  detail.firstAirDate ||
                  detail.added ||
                  series.firstAirDate ||
                  series.added
              ) || '1970-01-01T00:00:00.000Z',
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
      (candidate) => isPlayableFile(candidate) && String(candidate.id) === String(fileId)
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
          isPlayableFile(candidate.file) &&
          String(candidate.file.id) === String(fileId)
      );
    return episode ? { type: 'series', item: detail, episode, file: episode.file } : null;
  }

  async movieStreams(id, makeUrl, isAvailable = async () => true) {
    const movie = await this.findMovie(id);
    if (!movie) return [];
    const streams = [];
    for (const file of movie.files.filter(isPlayableFile)) {
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
    if (!isPlayableFile(episode?.file) || !(await isAvailable(detail, episode.file))) return [];
    return [this.#stream(detail, episode.file, makeUrl, 'series', videoId)];
  }

  #stream(item, file, makeUrl, type, mediaId) {
    const strm = isStrmPath(file.relativePath);
    const size = Number(file.size) || undefined;
    const filename = path.posix.basename(String(file.relativePath).replaceAll('\\', '/'));
    const description = technicalDescription(file, filename, strm);
    return compact({
      name: 'Cinephage',
      title: description,
      description,
      url: makeUrl({ type, mediaId, fileId: file.id }),
      behaviorHints: compact({
        notWebReady: true,
        bingeGroup: `cinephage-${canonicalMediaId(item)}`,
        filename: strm ? undefined : filename,
        videoSize: strm ? undefined : size
      })
    });
  }
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const decimals = unit > 0 && size < 100 ? 1 : 0;
  return `${size.toFixed(decimals)} ${units[unit]}`;
}
