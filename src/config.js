import path from 'node:path';

const MIN_SECRET_LENGTH = 32;

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function normalizeSourcePrefix(value) {
  const normalized = value.replaceAll('\\', '/').replace(/\/$/, '');
  return normalized || '/';
}

export function parsePathMappings(value) {
  if (!value?.trim()) {
    throw new Error('PATH_MAPPINGS is required');
  }

  let entries;
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    entries = Object.entries(parsed);
  } else {
    entries = trimmed.split(',').map((item) => {
      const separator = item.indexOf('=');
      if (separator < 1) {
        throw new Error(`Invalid PATH_MAPPINGS entry: ${item}`);
      }
      return [item.slice(0, separator), item.slice(separator + 1)];
    });
  }

  if (entries.length === 0) throw new Error('PATH_MAPPINGS cannot be empty');

  return entries
    .map(([source, target]) => {
      if (typeof source !== 'string' || typeof target !== 'string' || !source || !target) {
        throw new Error('PATH_MAPPINGS keys and values must be non-empty strings');
      }
      return {
        source: normalizeSourcePrefix(source),
        target: path.resolve(target)
      };
    })
    .sort((a, b) => b.source.length - a.source.length);
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(env = process.env) {
  const cinephageUrl = required(env, 'CINEPHAGE_URL').replace(/\/$/, '');
  const apiKey = required(env, 'CINEPHAGE_API_KEY');
  const secret = required(env, 'BRIDGE_SECRET');
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`BRIDGE_SECRET must contain at least ${MIN_SECRET_LENGTH} characters`);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(cinephageUrl);
  } catch {
    throw new Error('CINEPHAGE_URL must be an absolute HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('CINEPHAGE_URL must use HTTP or HTTPS');
  }

  const publicUrl = env.PUBLIC_URL?.trim().replace(/\/$/, '') || '';
  if (publicUrl) {
    const parsedPublicUrl = new URL(publicUrl);
    if (!['http:', 'https:'].includes(parsedPublicUrl.protocol)) {
      throw new Error('PUBLIC_URL must use HTTP or HTTPS');
    }
  }

  return Object.freeze({
    cinephageUrl,
    apiKey,
    secret,
    pathMappings: parsePathMappings(required(env, 'PATH_MAPPINGS')),
    port: positiveInteger(env.PORT, 8090, 'PORT'),
    publicUrl,
    addonToken: env.ADDON_TOKEN?.trim() || '',
    libraryCacheTtlMs: positiveInteger(
      env.LIBRARY_CACHE_TTL_SECONDS,
      30,
      'LIBRARY_CACHE_TTL_SECONDS'
    ) * 1000,
    seriesCacheTtlMs: positiveInteger(
      env.SERIES_CACHE_TTL_SECONDS,
      30,
      'SERIES_CACHE_TTL_SECONDS'
    ) * 1000,
    streamTokenTtlSeconds: positiveInteger(
      env.STREAM_TOKEN_TTL_SECONDS,
      21600,
      'STREAM_TOKEN_TTL_SECONDS'
    ),
    cinephageTimeoutMs: positiveInteger(
      env.CINEPHAGE_TIMEOUT_SECONDS,
      15,
      'CINEPHAGE_TIMEOUT_SECONDS'
    ) * 1000,
    logLevel: env.LOG_LEVEL?.trim().toLowerCase() || 'info'
  });
}
