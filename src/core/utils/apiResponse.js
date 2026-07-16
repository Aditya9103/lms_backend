/**
 * Standard API response helpers.
 *
 * All controllers must use these helpers (never res.json() directly) so
 * every response shares a consistent envelope shape:
 *
 *  Success: { success: true,  data: <payload>, meta: <pagination etc.> }
 *  Error:   { success: false, error: { code: <machine-readable>, message: <human-readable> } }
 *
 * The `meta` field is optional and used for paginated list endpoints.
 */

/**
 * Send a successful JSON response.
 * @param {import('express').Response} res
 * @param {*} data - Response payload
 * @param {number} [statusCode=200]
 * @param {Object} [meta={}] - Pagination or extra metadata
 */
export const sendSuccess = (res, data, statusCode = 200, meta = {}) => {
  const body = { success: true, data };
  if (Object.keys(meta).length > 0) body.meta = meta;
  return res.status(statusCode).json(body);
};

/**
 * Send an error JSON response.
 * @param {import('express').Response} res
 * @param {string} code - Machine-readable error code (e.g. 'COURSE_NOT_FOUND')
 * @param {string} message - Human-readable description
 * @param {number} statusCode
 */
export const sendError = (res, code, message, statusCode) => {
  return res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
};
