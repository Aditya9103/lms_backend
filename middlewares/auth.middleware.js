import jwt from "jsonwebtoken";

import User from "../models/user.model.js";
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
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new AppError("User does not exist", 404));
  }

  if (user.role !== "ADMIN" && user.subscription?.status !== "active") {
    return next(new AppError("Please subscribe to access this route.", 403));
  }

  next();
});
