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

const CourseSchema = new mongoose.Schema({
    filename: String,
    summary: String,
    roadmap: Array,
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
        if (!extractedText || extractedText.length < 20) throw new Error("Text not recognized");

        console.log("🤖 Generating academic study guide and roadmap...");

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an elite academic assistant. Output ONLY valid JSON.
                    Structure: { 
                        "roadmap": [
                            { "title": "Section Title", "description": "Brief info", "topics": ["Topic 1", "Topic 2"] }
                        ], 
                        "summary": "detailed_markdown_text" 
                    }
                    
                    Instructions for 'summary':
                    1. Use ## for titles, tables for comparisons, and > for key takeaways.
                    2. Use LaTeX for formulas: \\( E = mc^2 \\).`
                },
                {
                    role: "user",
                    content: `Analyze this material: ${extractedText.substring(0, 15000)}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const resultData = JSON.parse(response.choices[0].message.content);

        // --- FIXED ROADMAP PARSING ---
        // Force extract the array even if AI nests it under .levels
        let finalRoadmap = [];
        if (Array.isArray(resultData.roadmap)) {
            finalRoadmap = resultData.roadmap;
        } else if (resultData.roadmap && Array.isArray(resultData.roadmap.levels)) {
            finalRoadmap = resultData.roadmap.levels;
        }

        const newCourse = new Course({
            filename: req.file.originalname,
            summary: resultData.summary || "Summary generation failed.",
            roadmap: finalRoadmap
        });

        await newCourse.save();
        console.log(`✅ Saved to DB. Roadmap items: ${finalRoadmap.length}`);

        res.json(newCourse);
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/explain-topic', async (req, res) => {
    try {
        const { topic } = req.body;
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: `Explain topic "${topic}" using Markdown and professional tone.` }]
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
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});