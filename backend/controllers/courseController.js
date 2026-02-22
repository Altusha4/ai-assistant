const Course = require('../models/Course');
const aiService = require('../services/aiService');
const fs = require('fs');
const pdf = require('pdf-extraction');
const mammoth = require('mammoth');
const path = require('path');

exports.getAll = async (req, res) => {
    try {
        const courses = await Course.find({ userId: req.user.userId }).sort({ createdAt: -1 });
        res.json(courses);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.upload = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file provided" });

        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        let text = "";

        if (fileExt === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            text = data.text;
        } else if (fileExt === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            text = result.value;
        } else {
            text = fs.readFileSync(filePath, 'utf8');
        }

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        if (!text || text.trim().length < 20) {
            throw new Error("Extracted text is too short or unreadable");
        }

        const aiData = await aiService.analyzeText(text);

        const course = new Course({
            userId: req.user.userId,
            filename: req.file.originalname,
            summary: aiData.summary,
            roadmap: aiData.roadmap,
            completedTopics: []
        });

        await course.save();
        res.json(course);
    } catch (e) {
        console.error("Upload Error:", e);
        res.status(500).json({ error: e.message });
    }
};

exports.getQuiz = async (req, res) => {
    try {
        const { courseId, count } = req.body;
        const course = await Course.findOne({ _id: courseId, userId: req.user.userId });
        if (!course) return res.status(404).json({ error: "Course not found or access denied" });

        const quiz = await aiService.generateQuiz(course.summary, count || 5);
        res.json(quiz);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.explainTopic = async (req, res) => {
    try {
        const { topic } = req.body;
        if (!topic) return res.status(400).json({ error: "Topic is required" });

        const result = await aiService.explainTopic(topic);
        res.json(result);
    } catch (e) {
        console.error("Explain Topic Controller Error:", e);
        res.status(500).json({ error: e.message });
    }
};

exports.toggleTopic = async (req, res) => {
    try {
        const { topic } = req.body;
        const course = await Course.findOne({ _id: req.params.id, userId: req.user.userId });
        if (!course) return res.status(404).json({ error: "Course not found" });

        const index = course.completedTopics.indexOf(topic);
        if (index > -1) {
            course.completedTopics.splice(index, 1);
        } else {
            course.completedTopics.push(topic);
        }

        await course.save();
        res.json({ completedTopics: course.completedTopics });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const result = await Course.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        if (!result) return res.status(404).json({ error: "Access denied or not found" });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.saveFocus = async (req, res) => {
    try {
        const { minutes } = req.body;
        const course = await Course.findOne({ _id: req.params.id, userId: req.user.userId });
        if (!course) return res.status(404).json({ error: "Course not found" });

        course.focusMinutes += Number(minutes);
        await course.save();
        res.json({ success: true, totalFocus: course.focusMinutes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.addMusic = async (req, res) => {
    try {
        const course = await Course.findOne({ _id: req.params.id, userId: req.user.userId });
        if (!course) return res.status(404).json({ error: "Not found" });

        course.playlist.push(req.body.url);
        await course.save();

        res.json({ playlist: course.playlist });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};