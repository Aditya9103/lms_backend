import Discussion from "../models/discussion.model.js";
import asyncHandler from "../middlewares/asyncHandler.middleware.js";
import AppError from "../utils/AppError.js";
import User from "../models/user.model.js";

export const addQuestion = asyncHandler(async (req, res, next) => {
    const { courseId, lectureId, question } = req.body;
    const userId = req.user.id;

    if (!courseId || !lectureId || !question) {
        return next(new AppError("All fields are required", 400));
    }

    const user = await User.findById(userId);

    const discussion = await Discussion.create({
        courseId,
        lectureId,
        userId,
        userName: user.fullName,
        userAvatar: user.avatar?.secure_url,
        question
    });

    res.status(201).json({
        success: true,
        message: "Question posted successfully",
        discussion
    });
});

export const addReply = asyncHandler(async (req, res, next) => {
    const { discussionId, reply } = req.body;
    const userId = req.user.id;

    if (!discussionId || !reply) {
        return next(new AppError("Discussion ID and reply are required", 400));
    }

    const discussion = await Discussion.findById(discussionId);
    if (!discussion) {
        return next(new AppError("Discussion not found", 404));
    }

    const user = await User.findById(userId);

    discussion.replies.push({
        userId,
        userName: user.fullName,
        userAvatar: user.avatar?.secure_url,
        reply
    });

    await discussion.save();

    res.status(200).json({
        success: true,
        message: "Reply added successfully",
        discussion
    });
});

export const getDiscussions = asyncHandler(async (req, res, next) => {
    const { courseId, lectureId } = req.params;

    const discussions = await Discussion.find({ courseId, lectureId }).sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        discussions
    });
});
