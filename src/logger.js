const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

export function createLogger(level = 'info', output = console) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(name, message, fields = {}) {
    if (LEVELS[name] < threshold) return;
    const record = {
      time: new Date().toISOString(),
      level: name,
      message,
      ...fields
    };
    const method = name === 'error' ? 'error' : name === 'warn' ? 'warn' : 'log';
    output[method](JSON.stringify(record));
  }

  return Object.freeze({
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields)
  });
}
