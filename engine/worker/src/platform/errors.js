/* Errors the engine answers with a status. Anything else is a bug and is logged. */

export class EngineError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.name = 'EngineError';
    this.status = status;
    this.code = code;
  }
}

/** Stop the request with a status. The body is { error: message }, the old shape. */
export function fail(status, message, code = '') {
  throw new EngineError(status, message, code);
}

export const isEngineError = e => !!e && e.name === 'EngineError' && Number.isInteger(e.status);
