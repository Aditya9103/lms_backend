import { Schema, model } from 'mongoose';

const discussionSchema = new Schema({
    courseId: {
        type: Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    lectureId: {
        type: String, // String ID as used in Course model lectures array
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: String,
    userAvatar: String,
    question: {
        type: String,
        required: true,
        trim: true
    },
    timestamp: {
        type: Number, // Seconds into the video
        default: null
    },
    replies: [
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: 'User'
            },
            userName: String,
            userAvatar: String,
            reply: String,
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ]
}, {
    timestamps: true
});

const Discussion = model('Discussion', discussionSchema);

export default Discussion;
