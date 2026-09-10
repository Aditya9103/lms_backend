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
 * @param {Object|string} [metaOrMessage={}] - Pagination metadata object or message string
 */
export const sendSuccess = (res, data, statusCode = 200, metaOrMessage = {}) => {
  const body = { success: true, data };
  if (typeof metaOrMessage === 'string') {
    body.message = metaOrMessage;
  } else if (metaOrMessage && typeof metaOrMessage === 'object') {
    if (metaOrMessage.message) body.message = metaOrMessage.message;
    if (Object.keys(metaOrMessage).length > 0) body.meta = metaOrMessage;
  }
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
