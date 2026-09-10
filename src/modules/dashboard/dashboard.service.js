import userRepository from '../users/user.repository.js';
import courseRepository from '../courses/course.repository.js';
import AppError from '../../core/utils/AppError.js';

class DashboardService {
  async getLearnerDashboardData(userId) {
    const user = await userRepository.findByIdWithDashboardData(userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const continueLearning = user.recentlyWatched.length > 0 ? user.recentlyWatched[0] : null;

    const upcomingDeadlines = [];
    for (const prog of (user.progress || [])) {
      const courseId = prog.courseId?._id || prog.courseId;
      if (!courseId) continue;
      const course = await courseRepository.findById(courseId);
      if (course && course.sections) {
        course.sections.forEach(section => {
          section.quizzes?.forEach(quiz => {
            if (quiz.dueDate && new Date(quiz.dueDate) > new Date()) {
              upcomingDeadlines.push({
                title: quiz.title,
                dueDate: quiz.dueDate,
                type: 'QUIZ',
                courseTitle: course.title,
                courseId: course._id,
              });
            }
          });
          section.assignments?.forEach(assignment => {
            if (assignment.dueDate && new Date(assignment.dueDate) > new Date()) {
              upcomingDeadlines.push({
                title: assignment.title,
                dueDate: assignment.dueDate,
                type: 'ASSIGNMENT',
                courseTitle: course.title,
                courseId: course._id,
              });
            }
          });
        });
      }
    }
    upcomingDeadlines.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    const recommendedNextLessons = [];
    if (continueLearning && continueLearning.courseId) {
      const courseId = continueLearning.courseId?._id || continueLearning.courseId;
      const course = await courseRepository.findById(courseId);
      if (course && course.lectures && continueLearning.lectureId) {
        const currentLectureIndex = course.lectures.findIndex(
          l => l._id?.toString() === continueLearning.lectureId?.toString()
        );
        if (currentLectureIndex !== -1 && currentLectureIndex < course.lectures.length - 1) {
          recommendedNextLessons.push({
            courseId: course._id,
            lecture: course.lectures[currentLectureIndex + 1],
            courseTitle: course.title,
            reason: 'Next in your current course',
          });
        }
      }
    }

    let totalLectures = 0;
    let completedLecturesCount = 0;
    (user.progress || []).forEach(p => {
      const numLectures = p.courseId?.numberOfLectures || 0;
      totalLectures += numLectures;
      completedLecturesCount += (p.completedLectures || []).length;
    });
    const overallProgress = totalLectures > 0 ? Math.round((completedLecturesCount / totalLectures) * 100) : 0;

    const weakTopics = user.weakTopics || [];
    const recentlyWatched = user.recentlyWatched || [];

    let estimatedCompletionTime = 0;
    let sectionMastery = [];
    if (continueLearning && continueLearning.courseId) {
      const courseId = continueLearning.courseId?._id || continueLearning.courseId;
      const course = await courseRepository.findById(courseId);
      if (course && course.sections) {
        const userCourseProgress = (user.progress || []).find(p => {
          const pId = p.courseId?._id ? p.courseId._id.toString() : p.courseId?.toString();
          return pId === course._id.toString();
        });
        const completedLectures = userCourseProgress ? (userCourseProgress.completedLectures || []).map(id => id?.toString()).filter(Boolean) : [];
        const completedQuizzes = userCourseProgress ? (userCourseProgress.completedQuizzes || []).map(q => q.quizId?.toString()).filter(Boolean) : [];
        const completedAssignments = userCourseProgress ? (userCourseProgress.completedAssignments || []).map(a => a.assignmentId?.toString()).filter(Boolean) : [];

        course.sections.forEach(section => {
          let sectionTotalItems = (section.lectures?.length || 0) + (section.quizzes?.length || 0) + (section.assignments?.length || 0);
          let sectionCompletedItems = 0;

          section.lectures?.forEach(lecture => {
            if (completedLectures.includes(lecture._id.toString())) {
              sectionCompletedItems++;
            } else {
              estimatedCompletionTime += lecture.duration || 600;
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
            mastery: sectionTotalItems > 0 ? Math.round((sectionCompletedItems / sectionTotalItems) * 100) : 0,
          });
        });
      }
    }

    return {
      continueLearning,
      upcomingDeadlines,
      recommendedNextLessons,
      overallProgress,
      weakTopics,
      recentlyWatched,
      streak: user.streak,
      estimatedCompletionTime,
      sectionMastery,
    };
  }
}

export default new DashboardService();
