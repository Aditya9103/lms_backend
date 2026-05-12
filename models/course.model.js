import { model, Schema } from 'mongoose';

const courseSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      minlength: [8, 'Title must be atleast 8 characters'],
      maxlength: [50, 'Title cannot be more than 50 characters'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      minlength: [20, 'Description must be atleast 20 characters long'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
    },
    sections: [
      {
        title: { type: String, required: true },
        lectures: [
          {
            title: String,
            description: String,
            lecture: {
              public_id: { type: String, required: true },
              secure_url: { type: String, required: true },
            },
            duration: Number, // in seconds
            inVideoQuizzes: [
              {
                timestamp: { type: Number, required: true },
                question: { type: String, required: true },
                options: [String],
                answer: Number, // Index of correct option
              },
            ],
          },
        ],
        quizzes: [
          {
            title: String,
            questions: [
              {
                question: String,
                options: [String],
                answer: Number,
              },
            ],
            dueDate: Date,
          },
        ],
        assignments: [
          {
            title: String,
            description: String,
            dueDate: Date,
          },
        ],
      },
    ],
    lectures: [
      {
        title: String,
        description: String,
        lecture: {
          public_id: {
            type: String,
            required: true,
          },
          secure_url: {
            type: String,
            required: true,
          },
        },
        inVideoQuizzes: [
          {
            timestamp: { type: Number, required: true },
            question: { type: String, required: true },
            options: [String],
            answer: Number,
          },
        ],
      },
    ],
    thumbnail: {
      public_id: {
        type: String,
      },
      secure_url: {
        type: String,
      },
    },
    numberOfLectures: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: String,
      required: [true, 'Course instructor name is required'],
    },
  },
  {
    timestamps: true,
  }
);

const Course = model('Course', courseSchema);

export default Course;
