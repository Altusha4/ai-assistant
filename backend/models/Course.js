const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
    // Ссылка на ID пользователя из коллекции User
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    summary: {
        type: String,
        required: true
    },
    roadmap: {
        type: Array,
        required: true
    },
    completedTopics: {
        type: Array,
        default: []
    },
    focusMinutes: {
        type: Number,
        default: 0
    },
    playlist: {
        type: [String],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Course', CourseSchema);