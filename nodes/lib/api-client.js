/**
 * lib/api-client.js
 *
 * Shared Axios-based HTTP client for the IPGeolocation.io v3 API.
 *
 * Responsibilities
 * ─────────────────
 *  • Single Axios instance with base URL and sensible timeouts
 *  • Exponential-backoff retry for transient errors (5xx, ECONNRESET, ETIMEDOUT)
 *  • Structured error objects that every node can map to Node-RED status/done(err)
 *  • Rate-limit awareness (HTTP 429 → honour Retry-After header when present)
 *  • Credit-charge extraction from response headers
 */

'use strict';

const axios = require('axios');

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_URL       = 'https://api.ipgeolocation.io/v3';
const DEFAULT_TIMEOUT = 10_000;   // 10 s
const MAX_RETRIES     = 3;
const RETRY_DELAY_MS  = 500;      // base delay; doubles each attempt

// HTTP status codes that are safe to retry (server-side transient faults)
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// ─── Error Classes ───────────────────────────────────────────────────────────

class IPGeoError extends Error {
  /**
   * @param {string}  message   Human-readable description
   * @param {string}  code      Machine-readable code (e.g. 'AUTH_FAILED')
   * @param {number}  [status]  HTTP status code, if applicable
   * @param {object}  [body]    Raw API response body, if available
   */
  constructor(message, code, status, body) {
    super(message);
    this.name   = 'IPGeoError';
    this.code   = code;
    this.status = status || null;
    this.body   = body  || null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sleep for `ms` milliseconds (used in retry logic).
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Map an Axios error to a typed IPGeoError with a user-friendly message.
 *
 * @param {import('axios').AxiosError} err
 * @returns {IPGeoError}
 */
function mapAxiosError(err) {
  if (err.response) {
    const { status, data } = err.response;
    const apiMsg = (data && (data.message || data.error)) || '';

    switch (status) {
      case 400: return new IPGeoError(
        `Bad request: ${apiMsg || 'Invalid parameters'}`, 'BAD_REQUEST', 400, data);
      case 401: return new IPGeoError(
        `Authentication failed: ${apiMsg || 'Invalid or missing API key'}`, 'AUTH_FAILED', 401, data);
      case 403: return new IPGeoError(
        `Forbidden: ${apiMsg || 'Access denied (check plan limits or IP whitelist)'}`, 'FORBIDDEN', 403, data);
      case 404: return new IPGeoError(
        `Resource not found: ${apiMsg || 'Endpoint does not exist'}`, 'NOT_FOUND', 404, data);
      case 422: return new IPGeoError(
        `Unprocessable entity: ${apiMsg || 'Validation error'}`, 'VALIDATION', 422, data);
      case 423: return new IPGeoError(
        `API key locked: ${apiMsg || 'Quota exceeded or account suspended'}`, 'LOCKED', 423, data);
      case 429: return new IPGeoError(
        `Rate limit exceeded: ${apiMsg || 'Too many requests'}`, 'RATE_LIMITED', 429, data);
      case 500: return new IPGeoError(
        `API server error (500): ${apiMsg || 'Internal server error'}`, 'SERVER_ERROR', 500, data);
      default:  return new IPGeoError(
        `HTTP ${status}: ${apiMsg || err.message}`, 'HTTP_ERROR', status, data);
    }
  }

  if (err.request) {
    // Request was sent but no response received
    const code = err.code || '';
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
      return new IPGeoError(
        `Request timed out after ${DEFAULT_TIMEOUT / 1000}s`, 'TIMEOUT');
    }
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return new IPGeoError(
        'DNS resolution failed — check network connectivity', 'NETWORK_ERROR');
    }
    return new IPGeoError(`No response received: ${err.message}`, 'NO_RESPONSE');
  }

  // Something went wrong building the request
  return new IPGeoError(`Request setup error: ${err.message}`, 'REQUEST_ERROR');
}

// ─── Core Request Function ───────────────────────────────────────────────────

/**
 * Perform an HTTP GET or POST with automatic retries.
 *
 * @param {object} options
 * @param {'GET'|'POST'} options.method
 * @param {string}  options.path         Relative path, e.g. '/ipgeo'
 * @param {object}  [options.params]     URL query parameters
 * @param {object}  [options.data]       JSON body (POST only)
 * @param {object}  [options.headers]    Additional HTTP headers
 * @param {number}  [options.timeout]    Override default timeout (ms)
 * @param {number}  [options.maxRetries] Override default retry count
 * @returns {Promise<{ data: any, credits: number|null }>}
 */
async function request(options) {
  const {
    method      = 'GET',
    path,
    params      = {},
    data        = undefined,
    headers     = {},
    timeout     = DEFAULT_TIMEOUT,
    maxRetries  = MAX_RETRIES,
  } = options;

  const url = `${BASE_URL}${path}`;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await axios({
        method,
        url,
        params,
        data,
        headers: {
          'Accept':       'application/json',
          'Content-Type': 'application/json',
          'User-Agent':   'node-red-contrib-ipgeolocation-io/1.0.0',
          ...headers,
        },
        timeout,
        validateStatus: null, // We handle all status codes ourselves
      });

      // Successful response (2xx)
      if (response.status >= 200 && response.status < 300) {
        const credits = response.headers['x-credits-charged']
          ? Number(response.headers['x-credits-charged'])
          : null;
        return { data: response.data, credits };
      }

      // Handle retryable server-side errors
      if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
        let delay = RETRY_DELAY_MS * Math.pow(2, attempt);

        // Honour Retry-After header for 429 responses
        if (response.status === 429) {
          const retryAfter = response.headers['retry-after'];
          if (retryAfter) {
            delay = Math.max(delay, Number(retryAfter) * 1000);
          }
        }

        attempt++;
        await sleep(delay);
        continue;
      }

      // Non-retryable error — map and throw
      const fakeAxiosError = { response };
      throw mapAxiosError(fakeAxiosError);

    } catch (err) {
      // Axios network-level errors (ETIMEDOUT, ECONNRESET, etc.)
      if (err instanceof IPGeoError) throw err; // already mapped, re-throw

      const ipGeoErr = mapAxiosError(err);

      // Retry on network-level transient faults
      const isTransient =
        ipGeoErr.code === 'TIMEOUT'       ||
        ipGeoErr.code === 'NO_RESPONSE'   ||
        ipGeoErr.code === 'NETWORK_ERROR';

      if (isTransient && attempt < maxRetries) {
        attempt++;
        await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      throw ipGeoErr;
    }
  }

  // Should never reach here, but just in case
  throw new IPGeoError('Max retries exceeded', 'MAX_RETRIES');
}

// ─── Public API ──────────────────────────────────────────────────────────────

module.exports = { request, IPGeoError, BASE_URL };
