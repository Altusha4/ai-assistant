const express = require('express');
const multer = require('multer');
const pdf = require('pdf-extraction');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const app = express();

// Увеличиваем лимиты для обработки больших файлов
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const upload = multer({ dest: 'uploads/' });

// Сначала обслуживаем статические файлы
app.use(express.static(path.join(__dirname, 'public')));

let sessionContext = "";

// 1. Загрузка файла + Анализ
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "Файл не получен" });

        console.log(`📥 Файл получен: ${req.file.originalname}`);
        const filePath = req.file.path;
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        const dataBuffer = fs.readFileSync(filePath);

        let extractedText = "";

        try {
            if (fileExtension === '.pdf') {
                const data = await pdf(dataBuffer);
                extractedText = data.text;
            } else if (fileExtension === '.docx') {
                const result = await mammoth.extractRawText({ buffer: dataBuffer });
                extractedText = result.value;
            } else {
                extractedText = dataBuffer.toString();
            }
        } catch (parseErr) {
            console.error("Ошибка парсинга:", parseErr);
            throw new Error("Не удалось прочитать содержимое файла.");
        } finally {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        if (!extractedText || extractedText.trim().length < 20) {
            throw new Error("Текст не распознан. Возможно, это скан или пустой файл.");
        }

        sessionContext = extractedText;
        console.log(`📄 Текст извлечен (${sessionContext.length} симв.)`);

        console.log("🤖 Запрос к OpenAI... (лимит 12к символов для стабильности)");

        // Ограничиваем до 12000 символов, чтобы ИИ успел ответить за один раз и не выдал ошибку JSON
        const safeText = sessionContext.substring(0, 12000);

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are an academic tutor. Output ONLY valid JSON: { \"roadmap\": { \"levels\": [] }, \"summary\": \"\" }. Use Markdown in summary."
                },
                {
                    role: "user",
                    content: `Analyze this material. 1. Create a 4-level study roadmap (topics and descriptions). 2. Write a detailed summary. Context: ${safeText}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const resultData = JSON.parse(response.choices[0].message.content);

        // Поддержка структуры roadmap.levels или просто roadmap
        const finalRoadmap = resultData.roadmap.levels || resultData.roadmap || [];

        res.json({
            roadmap: finalRoadmap,
            summary: resultData.summary || ""
        });

    } catch (error) {
        console.error("❌ Ошибка сервера:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// 2. Объяснение конкретной темы
app.post('/explain-topic', async (req, res) => {
    try {
        const { topic } = req.body;
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "user",
                content: `Explain "${topic}" using this context: ${sessionContext.substring(0, 8000)}. Use Markdown and LaTeX.`
            }]
        });
        res.json({ explanation: response.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ГАРАНТИРОВАННЫЙ ФИКС ДЛЯ NODE 25 / EXPRESS 5 ---
// Используем middleware вместо app.get('*') или регулярных выражений, чтобы избежать PathError
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/upload') && !req.path.startsWith('/explain-topic')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});