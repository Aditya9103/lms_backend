import blogRepository from './blog.repository.js';
import cloudinary from 'cloudinary';
import AppError from '../../core/utils/AppError.js';

class BlogService {
  async createBlog(title, content, excerpt, category, author, file) {
    const blog = await blogRepository.createBlog({
      title,
      content,
      excerpt,
      category,
      author,
    });

    if (file) {
      try {
        const result = await cloudinary.v2.uploader.upload(file.path, {
          folder: 'lms/blogs',
        });
        if (result) {
          blog.thumbnail.public_id = result.public_id;
          blog.thumbnail.secure_url = result.secure_url;
        }
      } catch (e) {
        throw new AppError(e.message || 'File not uploaded, please try again', 400);
      }
    }

    await blogRepository.save(blog);
    return blog;
  }

  async getAllBlogs() {
    return await blogRepository.findAllBlogs();
  }

  async getBlogById(id) {
    const blog = await blogRepository.findBlogById(id);
    if (!blog) throw new AppError('Blog not found', 404);
    return blog;
  }

  async deleteBlog(id) {
    const blog = await blogRepository.deleteBlogById(id);
    if (!blog) throw new AppError('Blog not found', 404);
  }
}

export default new BlogService();
