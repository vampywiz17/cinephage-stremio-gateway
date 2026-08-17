import path from 'node:path';
import fs from 'node:fs/promises';

function normalizeCinephagePath(value) {
  return value.replaceAll('\\', '/').replace(/\/+$/, '') || '/';
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export class PathMapper {
  constructor(mappings) {
    this.mappings = mappings;
  }

  resolve(rootFolderPath, mediaPath, relativePath) {
    if (![rootFolderPath, mediaPath, relativePath].every((value) => typeof value === 'string')) {
      throw new Error('Cinephage returned an incomplete media path');
    }

    const cinephageRoot = normalizeCinephagePath(rootFolderPath);
    const mapping = this.mappings.find(
      ({ source }) => cinephageRoot === source || cinephageRoot.startsWith(`${source}/`)
    );
    if (!mapping) {
      throw new Error(`No PATH_MAPPINGS entry matches Cinephage root ${rootFolderPath}`);
    }

    const rootSuffix = cinephageRoot.slice(mapping.source.length).replace(/^\/+/, '');
    const mappedRoot = path.resolve(mapping.target, rootSuffix);
    const candidate = path.resolve(
      mappedRoot,
      mediaPath.replaceAll('\\', '/'),
      relativePath.replaceAll('\\', '/')
    );
    if (!isWithin(mapping.target, candidate)) {
      throw new Error('Resolved media path escapes its configured volume');
    }

    return candidate;
  }

  async verify(filename) {
    const mapping = this.mappings.find(({ target }) => isWithin(target, filename));
    if (!mapping) throw new Error('Media path is outside the configured volumes');
    const [realRoot, realFile, stat] = await Promise.all([
      fs.realpath(mapping.target),
      fs.realpath(filename),
      fs.stat(filename)
    ]);
    if (!isWithin(realRoot, realFile)) {
      throw new Error('Resolved media symlink escapes its configured volume');
    }
    if (!stat.isFile() || stat.size <= 0) throw new Error('Media path is not a non-empty file');
    return realFile;
  }
}
