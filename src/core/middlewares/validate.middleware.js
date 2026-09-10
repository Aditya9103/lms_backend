import { z } from 'zod';

/**
 * Zod-based validation middleware factory.
 *
 * Usage in routes:
 *   router.post('/login', validate(LoginDto), loginController);
 *   router.get('/search', validate(SearchQueryDto, 'query'), searchController);
 *
 * On validation failure, returns 400 with field-level errors:
 *   {
 *     success: false,
 *     error: {
 *       code: 'VALIDATION_ERROR',
 *       message: 'Invalid request data',
 *       fields: { email: ['Invalid email address'] }
 *     }
 *   }
 *
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {'body' | 'query' | 'params'} [source='body'] - Which part of the request to validate
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const flattened = result.error.flatten();
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: flattened.formErrors.length > 0 ? flattened.formErrors[0] : 'Invalid request data',
        fields: flattened.fieldErrors,
        ...(flattened.formErrors.length > 0 ? { formErrors: flattened.formErrors } : {}),
      },
    });
  }

  // Replace req[source] with the parsed (and coerced/transformed) data
  req[source] = result.data;
  next();
};

export default validate;
