const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const getAIResponse = async (systemPrompt, userContent) => {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            response_format: { type: "json_object" }
        });
        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error("OpenAI API Error:", error);
        throw new Error("Failed to get response from AI Service");
    }
};

const analyzeText = async (text) => {
    const systemPrompt = `You are an elite academic assistant. Analyze the lecture text and return a structured JSON object. 
    
    CRITICAL INSTRUCTIONS FOR "summary" FIELD:
    1. Use Markdown format.
    2. Use "## Section Title" for main chapters and "### Subsection Title" for sub-points. 
    3. The side navigation depends on these headers, so ensure at least 3-5 headers are present.
    4. Use LaTeX for all mathematical formulas: wrap inline math in $...$ and block math in $$...$$.
    5. Use bullet points for key takeaways.

    The JSON must contain:
    1. "summary": The structured summary as described above.
    2. "roadmap": An array of learning levels, e.g., [{"title": "Basics", "topics": ["Topic 1", "Topic 2"]}].

    Return ONLY valid JSON.`;

    return await getAIResponse(systemPrompt, text.substring(0, 15000));
};

const generateQuiz = async (summary, count, isExam = false) => {
    const difficultyContext = isExam
        ? "This is a FINAL EXAM. Questions should be complex, analytical, and focus on deep conceptual understanding rather than simple facts."
        : "This is a casual quiz. Questions should cover basic understanding and key terms.";

    const systemPrompt = `You are a university professor. ${difficultyContext}
    Generate ${count} multiple-choice questions based on the provided summary.
    Return ONLY a JSON object in this format: 
    { "questions": [ { "q": "Question text", "options": ["Option A", "Option B", "Option C", "Option D"], "correct": 0 } ] }
    The "correct" field must be the integer index (0-3) of the right answer.`;

    return await getAIResponse(systemPrompt, summary.substring(0, 5000));
};

const explainTopic = async (topic) => {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a professional academic tutor. Explain the topic in detail using Markdown. Use LaTeX for formulas (wrap them in $ for inline and $$ for blocks). Be concise but thorough."
                },
                { role: "user", content: `Explain this topic in depth: ${topic}` }
            ]
        });
        return { explanation: response.choices[0].message.content };
    } catch (error) {
        console.error("AI Explanation Error:", error);
        throw new Error("Failed to generate topic explanation");
    }
};

module.exports = {
    analyzeText,
    generateQuiz,
    explainTopic
};