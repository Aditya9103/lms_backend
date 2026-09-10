import Blog from './blog.model.js';

class BlogRepository {
  async createBlog(data) {
    return await Blog.create(data);
  }

  async findAllBlogs() {
    return await Blog.find({}).sort({ createdAt: -1 });
  }

  async findBlogById(id) {
    if (typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/)) {
      return await Blog.findById(id);
    }
    return await Blog.findOne({ slug: id });
  }

  async deleteBlogById(id) {
    return await Blog.findByIdAndDelete(id);
  }

  async save(blog) {
    return await blog.save();
  }
}

export default new BlogRepository();
