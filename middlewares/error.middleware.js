const errorMiddleware = (err, _req, res, _next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Something went wrong";

  // Handle Specific Backend Errors
  if (err.name === 'CastError') {
    err.message = `Resource not found. Invalid: ${err.path}`;
    err.statusCode = 400;
  }

  if (err.code === 11000) {
    err.message = `Duplicate field value entered`;
    err.statusCode = 400;
  }

  if (err.name === 'JsonWebTokenError') {
    err.message = `Json Web Token is invalid. Try again!`;
    err.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    err.message = `Json Web Token is expired. Try again!`;
    err.statusCode = 401;
  }

  res.status(err.statusCode).json({
    success: false,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

export default errorMiddleware;

