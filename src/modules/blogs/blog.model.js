import { Schema, model } from 'mongoose';

const blogSchema = new Schema({
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true
    },
    content: {
        type: String,
        required: [true, 'Content is required']
    },
    excerpt: {
        type: String,
        required: [true, 'Excerpt is required']
    },
    category: {
        type: String,
        default: 'General'
    },
    author: {
        type: String,
        default: 'Admin'
    },
    thumbnail: {
        public_id: String,
        secure_url: String
    },
    readingTime: {
        type: String,
        default: '5 min read'
    },
    slug: {
        type: String,
        trim: true,
        lowercase: true,
        index: true
    },
    status: {
        type: String,
        enum: ['draft', 'published'],
        default: 'published',
        index: true
    },
    tags: [String],
    metaDescription: String
}, {
    timestamps: true
});

const Blog = model('Blog', blogSchema);

export default Blog;
