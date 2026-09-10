import Course from './course.model.js';

class CourseRepository {
  async findAll() {
    return await Course.find({}).select('-lectures');
  }

  async findById(id) {
    return await Course.findById(id);
  }

  async findOne(query) {
    return await Course.findOne(query);
  }

  async create(courseData) {
    return await Course.create(courseData);
  }

  async updateById(id, updateData) {
    return await Course.findByIdAndUpdate(
      id,
      { $set: updateData },
      { runValidators: true }
    );
  }

  async deleteById(id) {
    const course = await Course.findById(id);
    if (course) {
      if (typeof course.deleteOne === 'function') {
        await course.deleteOne();
      } else {
        await Course.findByIdAndDelete(id);
      }
    }
    return course;
  }

  async save(courseDocument) {
    return await courseDocument.save();
  }
}

export default new CourseRepository();
