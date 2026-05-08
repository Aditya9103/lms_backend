import Blog from "../models/blog.model.js";
import asyncHandler from "../middlewares/asyncHandler.middleware.js";
import AppError from "../utils/AppError.js";
import cloudinary from 'cloudinary';

export const createBlog = asyncHandler(async (req, res, next) => {
    // STEP 1: Unpack the 'Envelope' (Request body)
    const { title, content, excerpt, category, author } = req.body;

    // Check if the user forgot to fill in any important fields
    if (!title || !content || !excerpt) {
        return next(new AppError("All fields are required", 400));
    }

    // STEP 2: Create a placeholder in our database
    const blog = await Blog.create({
        title,
        content,
        excerpt,
        category,
        author
    });

    // STEP 3: Handle the Image Upload
    // If the user sent an image, we send it to 'Cloudinary' (our online image library).
    if (req.file) {
        try {
            const result = await cloudinary.v2.uploader.upload(req.file.path, {
                folder: 'lms/blogs', // Store it in the 'blogs' folder
            });
            if (result) {
                // Save the secret links to the image in our database
                blog.thumbnail.public_id = result.public_id;
                blog.thumbnail.secure_url = result.secure_url;
            }
        } catch (e) {
            // If the internet drops while uploading the image
            return next(new AppError(e.message || 'File not uploaded, please try again', 400));
        }
    }

    await blog.save(); // Save everything to the database forever

    res.status(201).json({
        success: true,
        message: "Blog created successfully",
        blog
    });
});

export const getAllBlogs = asyncHandler(async (req, res, next) => {
    const blogs = await Blog.find({}).sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        blogs
    });
});

export const getBlogById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const blog = await Blog.findById(id);

    if (!blog) {
        return next(new AppError("Blog not found", 404));
    }

    res.status(200).json({
        success: true,
        blog
    });
});

export const deleteBlog = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const blog = await Blog.findByIdAndDelete(id);

    if (!blog) {
        return next(new AppError("Blog not found", 404));
    }

    res.status(200).json({
        success: true,
        message: "Blog deleted successfully"
    });
});
