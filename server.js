require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-extraction');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
    console.error("❌ ERROR: MONGO_URI not found in .env file!");
    process.exit(1);
}

mongoose.connect(mongoUri)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- Updated Schema with Focus & Exam Stats ---
const CourseSchema = new mongoose.Schema({
    filename: String,
    summary: String,
    roadmap: Array,
    completedTopics: { type: Array, default: [] },
    focusMinutes: { type: Number, default: 0 }, // Total time spent in Focus Mode
    examBestScore: { type: Number, default: 0 }, // Highest score achieved in Exam Mode
    createdAt: { type: Date, default: Date.now }
});
const Course = mongoose.model('Course', CourseSchema);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const upload = multer({ dest: 'uploads/' });

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// --- API Routes ---

// 1. Get All Courses
app.get('/api/courses', async (req, res) => {
    try {
        const courses = await Course.find().sort({ createdAt: -1 });
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Delete Course
app.delete('/api/courses/:id', async (req, res) => {
    try {
        await Course.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Course deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Toggle Topic Status
app.post('/api/courses/:id/toggle-topic', async (req, res) => {
    try {
        const { topic } = req.body;
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ error: "Course not found" });

        const index = course.completedTopics.indexOf(topic);
        if (index > -1) {
            course.completedTopics.splice(index, 1);
        } else {
            course.completedTopics.push(topic);
        }

        await course.save();
        res.json({ completedTopics: course.completedTopics });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. LOG FOCUS SESSION (New)
app.post('/api/courses/:id/focus-session', async (req, res) => {
    try {
        const { minutes } = req.body;
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ error: "Course not found" });

        course.focusMinutes += minutes;
        await course.save();
        res.json({ success: true, totalFocus: course.focusMinutes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. GENERATE EXAM (New & More Rigorous)
app.post('/api/generate-exam', async (req, res) => {
    try {
        const { courseId } = req.body;
        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ error: "Course not found" });

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an academic examiner. Generate a rigorous exam based on the lecture summary.
                    Output ONLY valid JSON: { "questions": [] }.
                    Each question: { "q": "text", "options": ["A", "B", "C", "D"], "correct": 0 }.
                    Create exactly 15 challenging questions.`
                },
                { role: "user", content: `Create exam for: ${course.summary.substring(0, 8000)}` }
            ],
            response_format: { type: "json_object" }
        });

        res.json(JSON.parse(response.choices[0].message.content));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. UPLOAD & ANALYZE
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file selected" });

        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        const dataBuffer = fs.readFileSync(filePath);
        let extractedText = "";

        if (fileExt === '.pdf') {
            const data = await pdf(dataBuffer);
            extractedText = data.text;
        } else if (fileExt === '.docx') {
            const result = await mammoth.extractRawText({ buffer: dataBuffer });
            extractedText = result.value;
        } else {
            extractedText = dataBuffer.toString();
        }

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (!extractedText || extractedText.length < 20) throw new Error("File content too small");

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an elite academic assistant. Output ONLY valid JSON.
                    Structure: { 
                        "roadmap": [{ "title": "Section", "topics": ["T1", "T2"] }], 
                        "summary": "markdown_text" 
                    }`
                },
                { role: "user", content: `Analyze: ${extractedText.substring(0, 15000)}` }
            ],
            response_format: { type: "json_object" }
        });

        const resultData = JSON.parse(response.choices[0].message.content);
        const newCourse = new Course({
            filename: req.file.originalname,
            summary: resultData.summary,
            roadmap: resultData.roadmap,
            completedTopics: []
        });

        await newCourse.save();
        res.json(newCourse);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. EXPLAIN TOPIC
app.post('/explain-topic', async (req, res) => {
    try {
        const { topic } = req.body;
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: `Explain "${topic}" professionally using Markdown and LaTeX.` }]
        });
        res.json({ explanation: response.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. GENERATE QUICK QUIZ
app.post('/generate-quiz', async (req, res) => {
    try {
        const { courseId, count } = req.body;
        const course = await Course.findById(courseId);
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Create a quiz JSON: { 'questions': [] }" },
                { role: "user", content: `Generate ${count} questions for: ${course.summary.substring(0, 5000)}` }
            ],
            response_format: { type: "json_object" }
        });
        res.json(JSON.parse(response.choices[0].message.content));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.use((req, res, next) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/upload')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Academic OS Server on http://localhost:${PORT}`));