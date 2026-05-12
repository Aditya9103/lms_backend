import asyncHandler from '../middlewares/asyncHandler.middleware.js';
import User from '../models/user.model.js';
import Course from '../models/course.model.js';
import AppError from '../utils/AppError.js';

/**
 * @GET_LEARNER_DASHBOARD_DATA
 * @ROUTE @GET {{URL}}/api/v1/dashboard/learner
 * @ACCESS Private (Logged in user only)
 */
export const getLearnerDashboardData = asyncHandler(async (req, res, next) => {
    const { id } = req.user;

    const user = await User.findById(id)
        .populate('progress.courseId')
        .populate('recentlyWatched.courseId');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    // 1. Continue Learning (Latest from recently watched)
    const continueLearning = user.recentlyWatched.length > 0 
        ? user.recentlyWatched[0] 
        : null;

    // 2. Upcoming Deadlines (Mocked or derived from quizzes/assignments in enrolled courses)
    // For now, let's look for quizzes/assignments in the user's enrolled courses with due dates > today
    const upcomingDeadlines = [];
    for (const prog of user.progress) {
        const course = await Course.findById(prog.courseId);
        if (course && course.sections) {
            course.sections.forEach(section => {
                section.quizzes.forEach(quiz => {
                    if (quiz.dueDate && new Date(quiz.dueDate) > new Date()) {
                        upcomingDeadlines.push({
                            title: quiz.title,
                            dueDate: quiz.dueDate,
                            type: 'QUIZ',
                            courseTitle: course.title,
                            courseId: course._id
                        });
                    }
                });
                section.assignments.forEach(assignment => {
                    if (assignment.dueDate && new Date(assignment.dueDate) > new Date()) {
                        upcomingDeadlines.push({
                            title: assignment.title,
                            dueDate: assignment.dueDate,
                            type: 'ASSIGNMENT',
                            courseTitle: course.title,
                            courseId: course._id
                        });
                    }
                });
            });
        }
    }
    // Sort by due date
    upcomingDeadlines.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // 3. Recommended Next Lessons
    // Logic: If user is in middle of a course, recommend next lecture.
    // If user finished a course, recommend from same category.
    const recommendedNextLessons = [];
    if (continueLearning) {
        const course = await Course.findById(continueLearning.courseId);
        if (course) {
            const currentLectureIndex = course.lectures.findIndex(l => l._id.toString() === continueLearning.lectureId.toString());
            if (currentLectureIndex !== -1 && currentLectureIndex < course.lectures.length - 1) {
                recommendedNextLessons.push({
                    courseId: course._id,
                    lecture: course.lectures[currentLectureIndex + 1],
                    courseTitle: course.title,
                    reason: 'Next in your current course'
                });
            }
        }
    }

    // 4. Progress Percentage (Overall)
    let totalLectures = 0;
    let completedLecturesCount = 0;
    user.progress.forEach(p => {
        if (p.courseId) {
            totalLectures += p.courseId.numberOfLectures || 0;
            completedLecturesCount += p.completedLectures.length;
        }
    });
    const overallProgress = totalLectures > 0 ? Math.round((completedLecturesCount / totalLectures) * 100) : 0;

    // 5. Weak Topics (Derived from quiz scores < 70%)
    const weakTopics = user.weakTopics || [];

    // 6. Recently Watched Content
    const recentlyWatched = user.recentlyWatched;

    // 7. Estimated Completion Time & Section Mastery for Active Course
    let estimatedCompletionTime = 0; // in seconds
    let sectionMastery = [];
    if (continueLearning) {
        const course = await Course.findById(continueLearning.courseId);
        if (course && course.sections) {
            const userCourseProgress = user.progress.find(p => p.courseId._id.toString() === course._id.toString());
            const completedLectures = userCourseProgress ? userCourseProgress.completedLectures.map(id => id.toString()) : [];
            const completedQuizzes = userCourseProgress ? userCourseProgress.completedQuizzes.map(q => q.quizId.toString()) : [];
            const completedAssignments = userCourseProgress ? userCourseProgress.completedAssignments.map(a => a.assignmentId.toString()) : [];

            course.sections.forEach(section => {
                let sectionTotalItems = (section.lectures?.length || 0) + (section.quizzes?.length || 0) + (section.assignments?.length || 0);
                let sectionCompletedItems = 0;

                section.lectures?.forEach(lecture => {
                    if (completedLectures.includes(lecture._id.toString())) {
                        sectionCompletedItems++;
                    } else {
                        estimatedCompletionTime += (lecture.duration || 600); // Default 10 mins if duration missing
                    }
                });

                section.quizzes?.forEach(quiz => {
                    if (completedQuizzes.includes(quiz._id.toString())) {
                        sectionCompletedItems++;
                    }
                });

                section.assignments?.forEach(assignment => {
                    if (completedAssignments.includes(assignment._id.toString())) {
                        sectionCompletedItems++;
                    }
                });

                sectionMastery.push({
                    title: section.title,
                    mastery: sectionTotalItems > 0 ? Math.round((sectionCompletedItems / sectionTotalItems) * 100) : 0
                });
            });
        }
    }

    res.status(200).json({
        success: true,
        message: 'Learner dashboard data fetched successfully',
        data: {
            continueLearning,
            upcomingDeadlines,
            recommendedNextLessons,
            overallProgress,
            weakTopics,
            recentlyWatched,
            streak: user.streak,
            estimatedCompletionTime,
            sectionMastery
        }
    });
});
