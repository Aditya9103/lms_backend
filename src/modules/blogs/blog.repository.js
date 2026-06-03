import Blog from './blog.model.js';

class BlogRepository {
  async createBlog(data) {
    return await Blog.create(data);
  }

  async findAllBlogs() {
    return await Blog.find({}).sort({ createdAt: -1 });
  }

  async findBlogById(id) {
    return await Blog.findById(id);
  }

  async deleteBlogById(id) {
    return await Blog.findByIdAndDelete(id);
  }

  async save(blog) {
    return await blog.save();
  }
}

export default new BlogRepository();
