import crypto from 'node:crypto';

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export class StreamTokenService {
  constructor(secret, ttlSeconds, now = () => Date.now()) {
    this.secret = secret;
    this.ttlSeconds = ttlSeconds;
    this.now = now;
  }

  #signature(payload) {
    return crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  create(claims) {
    const payload = base64urlJson({
      ...claims,
      exp: Math.floor(this.now() / 1000) + this.ttlSeconds
    });
    return `${payload}.${this.#signature(payload)}`;
  }

  verify(token) {
    const separator = token.lastIndexOf('.');
    if (separator <= 0) throw new Error('Malformed stream token');
    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    if (!constantTimeEqual(signature, this.#signature(payload))) {
      throw new Error('Invalid stream token');
    }

    let claims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Malformed stream token payload');
    }
    if (!Number.isSafeInteger(claims.exp) || claims.exp < Math.floor(this.now() / 1000)) {
      throw new Error('Expired stream token');
    }
    return claims;
  }
}
