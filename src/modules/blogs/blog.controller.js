import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import AppError from '../../core/utils/AppError.js';
import blogService from './blog.service.js';

export const createBlog = asyncHandler(async (req, res, next) => {
  const { title, content, excerpt, category, author, slug, metaDescription, tags } = req.body;

  if (!title || !content || !excerpt) {
    return next(new AppError('All fields are required', 400));
  }

  try {
    const blog = await blogService.createBlog(
      title,
      content,
      excerpt,
      category,
      author,
      req.file,
      slug,
      metaDescription,
      tags
    );
    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      blog,
    });
  } catch (error) {
    return next(error);
  }
});

export const getAllBlogs = asyncHandler(async (req, res, next) => {
  try {
    const blogs = await blogService.getAllBlogs();
    res.status(200).json({
      success: true,
      blogs,
    });
  } catch (error) {
    return next(error);
  }
});

export const getBlogById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  try {
    const blog = await blogService.getBlogById(id);
    res.status(200).json({
      success: true,
      blog,
    });
  } catch (error) {
    return next(error);
  }
});

export const deleteBlog = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  try {
    await blogService.deleteBlog(id);
    res.status(200).json({
      success: true,
      message: 'Blog deleted successfully',
    });
  } catch (error) {
    return next(error);
  }
});
