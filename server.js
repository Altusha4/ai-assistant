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
    console.error("❌ ERROR: MONGO_URI not found!");
    process.exit(1);
}

mongoose.connect(mongoUri)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const CourseSchema = new mongoose.Schema({
    filename: String,
    summary: String,
    roadmap: Array,
    completedTopics: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now }
});
const Course = mongoose.model('Course', CourseSchema);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const upload = multer({ dest: 'uploads/' });

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

app.get('/api/courses', async (req, res) => {
    try {
        const courses = await Course.find().sort({ createdAt: -1 });
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/courses/:id', async (req, res) => {
    try {
        await Course.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Course deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an elite academic assistant. Output ONLY valid JSON.
                    Structure: { 
                        "roadmap": [
                            { "title": "Section Title", "topics": ["Topic 1", "Topic 2"] }
                        ], 
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

app.post('/explain-topic', async (req, res) => {
    try {
        const { topic } = req.body;
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: `Explain "${topic}" professionally with Markdown and LaTeX.` }]
        });
        res.json({ explanation: response.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));