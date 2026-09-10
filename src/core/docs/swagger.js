import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LMS Enterprise API',
      version: '1.0.0',
      description: 'Production-ready Learning Management System RESTful API documentation.',
      contact: {
        name: 'API Support',
        email: 'support@lms.internal',
      },
    },
    servers: [
      {
        url: 'http://localhost:5001',
        description: 'Local Development Server',
      },
      {
        url: 'https://api.lms.com',
        description: 'Production Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Short-lived JWT access token passed in Authorization header: Bearer <token>',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken',
          description: 'HTTP-only rotation refresh token cookie for session restoration.',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: { type: 'object' },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Resource not found' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'NOT_FOUND' },
                details: { type: 'object' },
              },
            },
          },
        },
      },
    },
  },
  apis: [
    './src/app.js',
    './src/modules/**/*.routes.js',
    './src/modules/**/*.controller.js',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
