import { z } from 'zod';

/** POST /api/v1/courses */
export const CreateCourseDto = z.object({
  title: z
    .string()
    .min(8, 'Title must be at least 8 characters')
    .max(50, 'Title cannot exceed 50 characters')
    .trim(),
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters')
    .trim(),
  category: z.string().min(1, 'Category is required').trim(),
  createdBy: z.string().min(1, 'Instructor name is required').trim(),
});

/** PUT /api/v1/courses/:id */
export const UpdateCourseDto = z.object({
  title: z.string().min(8).max(50).trim().optional(),
  description: z.string().min(20).trim().optional(),
  category: z.string().min(1).trim().optional(),
  createdBy: z.string().min(1).trim().optional(),
}).strict();

/** POST /api/v1/courses/:id/sections */
export const AddSectionDto = z.object({
  title: z.string().min(2, 'Section title must be at least 2 characters').max(100).trim(),
  drip: z.object({
    releaseType: z.enum(['instant', 'days_after_enrollment', 'fixed_date']).default('instant'),
    releaseDays: z.coerce.number().min(0).optional(),
    releaseDate: z.coerce.date().optional(),
  }).optional(),
});

/** POST /api/v1/courses/:id/sections/:sectionId/lectures */
export const AddLectureDto = z.object({
  title: z.string().min(2, 'Lecture title must be at least 2 characters').max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  duration: z.coerce.number().min(0).optional(),
  cloudinaryPublicId: z.string().min(1, 'Cloudinary public_id is required'),
  cloudinarySecureUrl: z.string().url('Must be a valid Cloudinary URL'),
});

/** POST /api/v1/courses/:id/sections/:sectionId/quizzes */
export const AddQuizDto = z.object({
  title: z.string().min(2).max(200).trim(),
  timeLimit: z.coerce.number().min(0).default(0),
  maxAttempts: z.coerce.number().min(1).default(1),
  randomizeOrder: z.boolean().default(false),
  questions: z.array(
    z.object({
      question: z.string().min(1, 'Question text is required').trim(),
      type: z.enum(['MCQ', 'TRUE_FALSE', 'MULTI_SELECT', 'SHORT_ANSWER']).default('MCQ'),
      options: z.array(z.string()).min(2).optional(),
      answer: z.union([z.number(), z.array(z.number())]).optional(),
    })
  ).min(1, 'At least one question is required'),
  dueDate: z.coerce.date().optional(),
});

/** POST /api/v1/courses/:id/sections/:sectionId/assignments */
export const AddAssignmentDto = z.object({
  title: z.string().min(2).max(200).trim(),
  description: z.string().max(5000).trim().optional(),
  dueDate: z.coerce.date().optional(),
  rubric: z.array(
    z.object({
      criterion: z.string().min(1).trim(),
      maxScore: z.coerce.number().min(1),
      weight: z.coerce.number().min(1).max(100),
    })
  ).optional(),
});

/** POST /api/v1/courses/:id/publish */
export const PublishCourseDto = z.object({
  // No body fields required for publish — course ID comes from params
}).optional();

/** Query params for GET /api/v1/courses */
export const CourseListQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});
