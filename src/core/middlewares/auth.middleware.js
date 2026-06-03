import jwt from "jsonwebtoken";

import userRepository from "../../modules/users/user.repository.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "./asyncHandler.middleware.js";

export const isLoggedIn = asyncHandler(async (req, _res, next) => {
  // extracting token from the cookies
  const { token } = req.cookies;

  console.log("Cookies received:", req.cookies);

  // If no token send unauthorized message
  if (!token) {
    return next(new AppError("Unauthorized, please login to continue", 401));
  }

  // Decoding the token using jwt package verify method
  try {
    const decoded = await jwt.verify(token, process.env.JWT_SECRET);

    // If all good store the id in req object, here we are modifying the request object and adding a custom field user in it
    req.user = decoded;

    // Do not forget to call the next other wise the flow of execution will not be passed further
    next();
  } catch (error) {
    return next(new AppError(error.message, 401));
  }

});


// Middleware to check if user is admin or not
export const authorizeRoles = (...roles) =>
  asyncHandler(async (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to view this route", 403)
      );
    }

    next();
  });

// Middleware to check if user has an active subscription or not
export const authorizeSubscribers = asyncHandler(async (req, _res, next) => {
  // If user is not admin or does not have an active subscription then error else pass
  const user = await userRepository.findById(req.user.id);

  if (!user) {
    return next(new AppError("User does not exist", 404));
  }

  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && user.subscription?.status !== "active") {
    return next(new AppError("Please subscribe to access this route.", 403));
  }

  next();
});

// Middleware for specifically authorizing super admins
export const authorizeSuperAdmin = asyncHandler(async (req, _res, next) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return next(new AppError("Access denied. Only Super Admin can perform this action.", 403));
  }
  next();
});

// Middleware to check specific granular permissions
export const checkPermission = (requiredPermission) => asyncHandler(async (req, _res, next) => {
  const user = await userRepository.findById(req.user.id);
  
  if (!user) {
    return next(new AppError("User not found.", 404));
  }

  // Super Admins inherently have all permissions or they can be checked normally
  if (user.role === 'SUPER_ADMIN') {
    return next();
  }

  if (!user.permissions || !user.permissions.includes(requiredPermission)) {
    return next(new AppError(`You lack the required permission: ${requiredPermission}`, 403));
  }

  next();
});

