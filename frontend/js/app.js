let currentCourseId = null;
let currentPlaylist = [];
let roadmapData = null;
let completedTopics = new Set();
let quizQuestions = [];
let currentQuestionIndex = 0;
let userAnswers = [];
let focusInterval = null;
let secondsLeft = 1500;
let totalSeconds = 1500;
let wasRunningBeforeBlur = false;
let isExamActive = false;
let isLoginMode = true;
const originalTitle = document.title;

const API = {
    async request(url, options = {}) {
        const token = localStorage.getItem('study_fit_token');

        const headers = { ...options.headers };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const res = await fetch(url, { ...options, headers });

            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('study_fit_token');
                location.reload();
                return null;
            }

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Server error: ${res.status}`);
            }

            return await res.json();
        } catch (e) {
            console.error("API Error:", e.message);
            throw e;
        }
    },
    async get(url) { return this.request(url, { method: 'GET' }); },
    async post(url, body) { return this.request(url, { method: 'POST', body: JSON.stringify(body) }); },
    async upload(file) {
        const formData = new FormData();
        formData.append('file', file);
        return this.request('/api/courses/upload', { method: 'POST', body: formData });
    }
};

window.toggleAuthMode = function() {
    isLoginMode = !isLoginMode;
    const nameInput = document.getElementById('auth-name');
    const emailInput = document.getElementById('auth-email');
    const title = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit');
    const toggleBtn = document.getElementById('auth-toggle-btn');
    const toggleText = document.getElementById('auth-toggle-text');

    if (!isLoginMode) {
        title.innerText = "Join Study-Fit";
        submitBtn.innerText = "Register";
        toggleBtn.innerText = "Back to Login";
        if (toggleText) toggleText.innerText = "Have an account?";
        nameInput.classList.remove('hidden');
        emailInput.classList.remove('hidden');
    } else {
        title.innerText = "Welcome Back";
        submitBtn.innerText = "Login";
        toggleBtn.innerText = "Create account";
        if (toggleText) toggleText.innerText = "New here?";
        nameInput.classList.add('hidden');
        emailInput.classList.add('hidden');
    }
};

function showAuthError(message, isSuccess = false) {
    const errorBlock = document.getElementById('auth-error');
    errorBlock.innerText = message;
    errorBlock.classList.remove('hidden', 'text-red-500', 'bg-red-50', 'text-green-600', 'bg-green-50');

    if (isSuccess) {
        errorBlock.classList.add('text-green-600', 'bg-green-50');
    } else {
        errorBlock.classList.add('text-red-500', 'bg-red-50');
    }

    setTimeout(() => errorBlock.classList.add('hidden'), 5000);
}

window.handleAuth = async function() {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;
    const email = document.getElementById('auth-email').value;

    if (!username || !password) return showAuthError("Enter username and password");

    const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
    const body = isLoginMode ? { username, password } : { name, email, username, password };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Auth failed");

        if (isLoginMode) {
            localStorage.setItem('study_fit_token', data.token);
            location.reload();
        } else {
            showAuthError("Success! Now please login.", true);
            setTimeout(() => window.toggleAuthMode(), 2000);
        }
    } catch (e) {
        showAuthError(e.message);
    }
};

window.handleLogout = function() {
    if (confirm("Are you sure you want to sign out?")) {
        localStorage.removeItem('study_fit_token');
        localStorage.removeItem('lastCourseId');
        localStorage.removeItem('user_name');

        location.reload();
    }
};

function showScreen(id) {
    const screens = ['upload', 'summary', 'roadmap', 'quiz', 'focus', 'study', 'exam'];
    screens.forEach(s => document.getElementById('screen-' + s)?.classList.add('hidden'));

    const contentWrap = document.getElementById('content-wrap');
    const uploadScreen = document.getElementById('screen-upload');

    if (id === 'upload') {
        uploadScreen.classList.remove('hidden');
        contentWrap.classList.add('hidden');
    } else {
        uploadScreen.classList.add('hidden');
        contentWrap.classList.remove('hidden');
        document.getElementById('screen-' + id)?.classList.remove('hidden');
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('nav-btn-active');
        if (btn.id === `btn-${id}`) btn.classList.add('nav-btn-active');
    });
}

function updateTimerRange(val) {
    totalSeconds = val * 60;
    secondsLeft = totalSeconds;
    document.getElementById('range-val').innerText = val;
    document.getElementById('focus-timer').innerText = `${val}:00`;
}

function startFocus() {
    const btn = document.getElementById('focus-start-btn');
    const miniTimer = document.getElementById('mini-timer');

    if (focusInterval) {
        clearInterval(focusInterval);
        focusInterval = null;
        btn.innerText = "Resume Session";
        return;
    }

    miniTimer.classList.remove('hidden');
    btn.innerText = "Pause Session";

    focusInterval = setInterval(() => {
        secondsLeft--;
        const m = Math.floor(secondsLeft / 60);
        const s = secondsLeft % 60;
        const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

        document.getElementById('focus-timer').innerText = timeStr;
        document.getElementById('mini-timer-display').innerText = timeStr;

        if (secondsLeft <= 0) {
            clearInterval(focusInterval);
            alert("Session Complete!");
            resetFocusUI();
        }
    }, 1000);
}

function resetFocusUI() {
    clearInterval(focusInterval);
    focusInterval = null;
    document.getElementById('focus-start-btn').innerText = "Start Session";
    document.getElementById('mini-timer').classList.add('hidden');

    const player = document.getElementById('focus-player');
    if (player) player.src = "";
    document.getElementById('player-container')?.classList.add('hidden');
    document.getElementById('player-placeholder')?.classList.remove('hidden');

    updateTimerRange(document.getElementById('range-val').innerText || 25);
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {

        if (isExamActive) {
            finishExam(true);
            return;
        }

        if (focusInterval) {
            wasRunningBeforeBlur = true;
            clearInterval(focusInterval);
            focusInterval = null;
            document.title = "⚠️ PAUSED";
        }
    }

    else {
        document.title = originalTitle;

        if (wasRunningBeforeBlur && !isExamActive) {
            document.getElementById('lock-overlay').style.display = 'flex';
        }
    }
});

function dismissLock() {
    document.getElementById('lock-overlay').style.display = 'none';
    if (wasRunningBeforeBlur) {
        startFocus();
        wasRunningBeforeBlur = false;
    }
}

async function handleFileUpload() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files[0]) return;

    const initial = document.getElementById('upload-initial');
    const loading = document.getElementById('upload-loading');
    const success = document.getElementById('upload-success');
    const card = document.getElementById('upload-card');
    const progressBar = document.getElementById('upload-progress-bar');
    const stepText = document.getElementById('loading-step');

    initial.classList.add('hidden');
    loading.classList.remove('hidden');
    card.classList.add('upload-processing');

    const steps = ["Reading Content", "Extracting Key Concepts", "Structuring Roadmap", "Finalizing OS"];
    for(let i = 0; i < steps.length; i++) {
        stepText.innerText = steps[i];
        progressBar.style.width = ((i + 1) * 25) + "%";
        await new Promise(r => setTimeout(r, 800));
    }

    try {
        const data = await API.upload(fileInput.files[0]);
        if (data && data._id) {
            loading.classList.add('hidden');
            success.classList.remove('hidden');
            card.classList.remove('upload-processing');
            launchConfetti(100);

            setTimeout(() => {
                openSavedCourse(data);
                loadHistory();
                success.classList.add('hidden');
                initial.classList.remove('hidden');
            }, 1500);
        }
    } catch (e) {
        alert("Upload failed: " + e.message);
        initial.classList.remove('hidden');
        loading.classList.add('hidden');
        card.classList.remove('upload-processing');
    }
}

async function loadHistory() {
    const courses = await API.get('/api/courses');
    if (!courses) return;
    const list = document.getElementById('historyList');
    list.innerHTML = courses.map(c => `
        <div class="glass p-3 rounded-2xl flex justify-between items-center group cursor-pointer hover:border-indigo-500 mb-2">
            <span onclick='loadSpecificCourse("${c._id}")' class="text-xs font-bold truncate">📚 ${c.filename}</span>
            <button onclick="deleteCourse('${c._id}')" class="opacity-0 group-hover:opacity-100 text-red-400 transition-all">✕</button>
        </div>
    `).join('');
}

async function loadSpecificCourse(id) {
    const courses = await API.get('/api/courses');
    if (!courses) return;
    const course = courses.find(c => c._id === id);
    if (course) {
        openSavedCourse(course);
    } else {
        localStorage.removeItem('lastCourseId');
    }
}

function openSavedCourse(course) {
    currentCourseId = course._id;
    localStorage.setItem('lastCourseId', course._id);
    roadmapData = course.roadmap;
    completedTopics = new Set(course.completedTopics || []);

    const defaultLive = "https://www.youtube.com/watch?v=jfKfPfyJRdk";

    let savedPlaylist = course.playlist || [];
    if (savedPlaylist.length === 0) {
        currentPlaylist = [defaultLive];
    } else {
        if (!savedPlaylist.includes(defaultLive)) {
            currentPlaylist = [defaultLive, ...savedPlaylist];
        } else {
            currentPlaylist = savedPlaylist;
        }
    }

    const summaryElem = document.getElementById('summaryContent');
    if (course.summary) {
        summaryElem.innerHTML = marked.parse(course.summary);

        setTimeout(() => {
            generateOutline();
        }, 100);

        if (window.MathJax) {
            MathJax.typesetPromise([summaryElem]).catch((err) => console.log('MathJax Error:', err));
        }
    }

    renderRoadmap();
    renderMusicCatalog();
    updateProgressVisuals();
    unlockNav();
    showScreen('summary');
}

function renderRoadmap() {
    if (!roadmapData) return;
    const container = document.getElementById('roadmapContent');
    container.innerHTML = roadmapData.map((lvl, i) => `
        <div class="glass p-8 rounded-[3rem] mb-6">
            <h3 class="text-xl font-black mb-4">Level 0${i+1}: ${lvl.title}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${lvl.topics.map(t => `
                    <div class="flex items-center gap-3 p-4 bg-white/40 rounded-2xl ${completedTopics.has(t) ? 'topic-checked opacity-50 grayscale' : ''}">
                        <input type="checkbox" onchange="toggleTopic('${t.replace(/'/g, "\\'")}')" ${completedTopics.has(t) ? 'checked' : ''}>
                        <button onclick="fetchTopicExplanation('${t.replace(/'/g, "\\'")}')" class="text-sm font-bold text-left hover:text-indigo-600 transition-colors">${t}</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
    updateProgressVisuals();
}

async function toggleTopic(topic) {
    const res = await API.post(`/api/courses/${currentCourseId}/toggle-topic`, { topic });
    if (res && res.completedTopics) {
        completedTopics = new Set(res.completedTopics);
        renderRoadmap();
    }
}

async function fetchTopicExplanation(topic) {
    showScreen('study');

    const titleElem = document.getElementById('study-topic-title');
    if (titleElem) titleElem.innerText = topic;

    const container = document.getElementById('studyContent');

    container.innerHTML = `
        <div class="p-20 text-center flex flex-col items-center justify-center space-y-4">
            <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p class="animate-pulse font-black text-indigo-600 uppercase tracking-widest text-xs">AI is drafting your personal lesson...</p>
        </div>`;

    try {
        const res = await API.post('/api/courses/explain-topic', { topic });

        if (res && res.explanation) {
            container.innerHTML = `
                <div id="printableStudyContent" class="glass p-12 lg:p-16 rounded-[4rem] prose prose-indigo max-w-4xl mx-auto page-fade shadow-2xl border border-white/40 bg-white/40">
                    <div class="flex items-center justify-between mb-10 print:hidden">
                        <span class="bg-indigo-100 text-indigo-600 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">AI Personal Tutor Deep-Dive</span>
                        <span class="text-[10px] text-slate-300 font-bold uppercase tracking-widest italic">Personalized for you</span>
                    </div>

                    <div class="markdown-body leading-relaxed text-slate-700">
                        ${marked.parse(res.explanation)}
                    </div>

                    <div class="hidden print:block mt-20 pt-10 border-t border-slate-200 text-center text-slate-400 text-[10px] font-bold uppercase">
                        Study-Fit Academic OS — Generated Deep-Dive Lesson on ${topic}
                    </div>

                    <div class="mt-12 pt-8 border-t border-slate-100 flex justify-start print:hidden">
                        <button onclick="showScreen('roadmap')" class="text-sm font-bold text-indigo-600 flex items-center gap-2 hover:gap-3 transition-all">
                            <span>←</span> Back to Study Route
                        </button>
                    </div>
                </div>`;

            if (window.MathJax) {
                MathJax.typesetPromise([container]).catch((err) => console.error('MathJax Error:', err));
            }
        } else {
            container.innerHTML = `<div class="p-20 text-center text-red-500 font-bold">Failed to generate explanation.</div>`;
        }
    } catch (e) {
        console.error("AI Error:", e);
        container.innerHTML = `<div class="p-20 text-center text-red-500 font-bold">Server Connection Error.</div>`;
    }
}

function getYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

async function addCustomMusic() {
    const input = document.getElementById('musicUrlInput');
    const url = input.value.trim();

    if (!getYoutubeId(url)) {
        alert("Please enter a valid YouTube link!");
        return;
    }

    try {
        const res = await API.post(`/api/courses/${currentCourseId}/music`, { url });

        if (res && res.playlist) {
            const defaultLive = "https://www.youtube.com/watch?v=jfKfPfyJRdk";
            let updatedList = res.playlist;

            if (!updatedList.includes(defaultLive)) {
                currentPlaylist = [defaultLive, ...updatedList];
            } else {
                currentPlaylist = updatedList;
            }

            renderMusicCatalog();
            input.value = '';
        }
    } catch (e) {
        console.error("Error:", e);
        alert("Failed to save video.");
    }
}

function renderMusicCatalog() {
    const catalog = document.getElementById('musicCatalog');
    if (!catalog) return;
    catalog.innerHTML = currentPlaylist.map(url => {
        const id = getYoutubeId(url);
        return `
            <div onclick="playMusic('${id}')" class="cursor-pointer group relative">
                <img src="https://img.youtube.com/vi/${id}/mqdefault.jpg" class="rounded-xl w-full border-2 border-transparent group-hover:border-indigo-500 transition-all">
                <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 rounded-xl">
                    <span class="text-white text-2xl">▶️</span>
                </div>
            </div>`;
    }).join('');
}

function playMusic(videoId) {
    document.getElementById('player-placeholder')?.classList.add('hidden');
    const container = document.getElementById('player-container');
    const player = document.getElementById('focus-player');
    if (container) container.classList.remove('hidden');
    if (player) player.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
}

// --- КВИЗЫ ---
function prepareQuiz() {
    showScreen('quiz');
    document.getElementById('quiz-setup').classList.remove('hidden');
    document.getElementById('quiz-container').classList.add('hidden');
    document.getElementById('quiz-results').classList.add('hidden');
}

async function startQuiz(count) {
    const setup = document.getElementById('quiz-setup');
    setup.innerHTML = `<div class="p-10 font-bold animate-bounce text-indigo-600">Generating Quiz...</div>`;
    const res = await API.post('/api/courses/quiz', { courseId: currentCourseId, count });
    if (res && res.questions) {
        quizQuestions = res.questions;
        currentQuestionIndex = 0;
        userAnswers = new Array(quizQuestions.length).fill(null);
        setup.classList.add('hidden');
        document.getElementById('quiz-container').classList.remove('hidden');
        displayQuestion();
    }
}

function displayQuestion() {
    const q = quizQuestions[currentQuestionIndex];
    renderQuestionNav('quiz-nav-grid', currentQuestionIndex, userAnswers, 'jumpToQuestion');

    document.getElementById('quiz-question').innerText = q.q;
    document.getElementById('quiz-options').innerHTML = q.options.map((opt, i) => `
        <button onclick="selectOption(${i})" 
            class="w-full text-left p-5 rounded-2xl border-2 transition-all 
            ${userAnswers[currentQuestionIndex] === i ? 'border-indigo-600 bg-indigo-50 shadow-inner' : 'border-slate-100 bg-white/50 hover:border-indigo-200'}">
            ${opt}
        </button>`).join('');

    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    prevBtn.style.visibility = currentQuestionIndex === 0 ? "hidden" : "visible";
    nextBtn.innerText = currentQuestionIndex === quizQuestions.length - 1 ? "Finish" : "Next";
    nextBtn.disabled = userAnswers[currentQuestionIndex] === null;
    nextBtn.style.opacity = nextBtn.disabled ? "0.3" : "1";
}

function jumpToQuestion(index) {
    currentQuestionIndex = index;
    displayQuestion();
}

function handlePrev() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        displayQuestion();
    }
}

function handleNext() {
    if (currentQuestionIndex < quizQuestions.length - 1) {
        currentQuestionIndex++;
        displayQuestion();
    } else {
        finishQuiz();
    }
}

function selectOption(i) {
    userAnswers[currentQuestionIndex] = i;
    displayQuestion();
}

function finishQuiz() {
    let score = 0;
    quizQuestions.forEach((q, i) => { if (userAnswers[i] === q.correct) score++; });

    const result = celebration(score, quizQuestions.length);

    document.getElementById('quiz-container').classList.add('hidden');
    document.getElementById('quiz-results').classList.remove('hidden');

    // Показываем баллы и текст
    document.querySelector('#quiz-results h2').innerText = result.title;
    document.getElementById('quiz-score-display').innerHTML = `
        <div class="text-indigo-600 font-black text-6xl mb-4">${score} / ${quizQuestions.length}</div>
        <p class="text-slate-500 font-medium">${result.text}</p>
    `;

    renderReviewGrid();
}

function renderReviewGrid() {
    const grid = document.getElementById('review-nav-grid');
    grid.innerHTML = quizQuestions.map((q, i) => {
        const isCorrect = userAnswers[i] === q.correct;
        const colorClass = isCorrect ? 'bg-green-100 text-green-600 border-green-200' : 'bg-red-100 text-red-600 border-red-200';
        return `
            <button onclick="showReviewDetail(${i})" class="w-12 h-12 rounded-2xl font-black border-2 transition-all hover:scale-110 ${colorClass}">
                ${i + 1}
            </button>
        `;
    }).join('');
}

function showReviewDetail(index) {
    const q = quizQuestions[index];
    const userAns = userAnswers[index];
    const isCorrect = userAns === q.correct;

    const explanationDiv = document.getElementById('review-explanation');
    explanationDiv.classList.remove('hidden');

    document.getElementById('review-q-text').innerText = `Question ${index + 1}: ${q.q}`;
    document.getElementById('review-correct-text').innerText = `✓ Correct Answer: ${q.options[q.correct]}`;

    const userTextElem = document.getElementById('review-user-text');
    if (!isCorrect) {
        userTextElem.innerText = `✗ Your Answer: ${q.options[userAns]}`;
        userTextElem.classList.remove('hidden');
    } else {
        userTextElem.classList.add('hidden');
    }
}

// --- EXAM MODE ---
async function startExam(count) {
    const setup = document.getElementById('exam-warning');
    setup.innerHTML = `<div class="p-10 font-bold animate-pulse text-red-500 text-center uppercase tracking-widest">Securing environment & generating questions...</div>`;
    const res = await API.post('/api/courses/quiz', { courseId: currentCourseId, count, isExam: true });
    if (res && res.questions) {
        quizQuestions = res.questions;
        currentQuestionIndex = 0;
        userAnswers = new Array(quizQuestions.length).fill(null);
        isExamActive = true;
        document.getElementById('exam-warning').classList.add('hidden');
        document.getElementById('exam-container').classList.remove('hidden');
        displayExamQuestion();
    }
}

function displayExamQuestion() {
    const q = quizQuestions[currentQuestionIndex];
    renderQuestionNav('exam-nav-grid', currentQuestionIndex, userAnswers, 'jumpToExamQuestion');

    document.getElementById('exam-progress').innerText = `${currentQuestionIndex + 1}/${quizQuestions.length}`;
    document.getElementById('exam-question').innerText = q.q;
    document.getElementById('exam-options').innerHTML = q.options.map((opt, i) => `
        <button onclick="selectExamOption(${i})" 
            class="w-full text-left p-6 rounded-2xl border-2 transition-all 
            ${userAnswers[currentQuestionIndex] === i ? 'border-red-600 bg-red-50' : 'border-slate-100 hover:border-red-200'} font-bold">
            ${opt}
        </button>`).join('');

    const prevBtn = document.getElementById('exam-prev-btn');
    const nextBtn = document.getElementById('exam-next-btn');
    prevBtn.style.visibility = currentQuestionIndex === 0 ? "hidden" : "visible";
    nextBtn.innerText = currentQuestionIndex === quizQuestions.length - 1 ? "Finish Exam" : "Next Question";
}

function jumpToExamQuestion(index) {
    currentQuestionIndex = index;
    displayExamQuestion();
}

function handleExamPrev() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        displayExamQuestion();
    }
}

function handleExamNext() {
    if (userAnswers[currentQuestionIndex] === null) {
        alert("Please select an answer first!");
        return;
    }
    if (currentQuestionIndex < quizQuestions.length - 1) {
        currentQuestionIndex++;
        displayExamQuestion();
    } else {
        finishExam(false);
    }
}

function selectExamOption(i) {
    userAnswers[currentQuestionIndex] = i;
    displayExamQuestion();
}

function finishExam(isCheated = false) {
    if (!isExamActive) return;
    isExamActive = false;

    let score = 0;
    if (!isCheated) {
        quizQuestions.forEach((q, i) => { if (userAnswers[i] === q.correct) score++; });

        const result = celebration(score, quizQuestions.length);

        alert(`${result.title}\n\n${result.text}\n\nFinal Score: ${score}/${quizQuestions.length}`);
    } else {
        alert("EXAM TERMINATED! Integrity violation detected. Score: 0");
    }

    document.getElementById('exam-container').classList.add('hidden');
    document.getElementById('exam-warning').classList.remove('hidden');
    showScreen('summary');
}

// --- ВСПОМОГАТЕЛЬНЫЕ ---
function renderQuestionNav(containerId, activeIndex, answersArray, jumpFunction) {
    const navGrid = document.getElementById(containerId);
    if (!navGrid) return;
    navGrid.innerHTML = quizQuestions.map((_, i) => {
        let statusClass = "bg-slate-100 text-slate-400";
        if (i === activeIndex) statusClass = "bg-indigo-600 text-white shadow-lg scale-110";
        else if (answersArray[i] !== null) statusClass = "bg-indigo-100 text-indigo-600 border-2 border-indigo-200";
        return `<button onclick="${jumpFunction}(${i})" class="w-10 h-10 rounded-xl font-bold transition-all ${statusClass}">${i + 1}</button>`;
    }).join('');
}

function updateProgressVisuals() {
    if (!roadmapData) return;
    const allTopics = roadmapData.reduce((acc, lvl) => acc.concat(lvl.topics), []);
    const percent = Math.round((completedTopics.size / allTopics.length) * 100) || 0;
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressPercent');
    if (bar) bar.style.width = percent + '%';
    if (text) text.innerText = percent + '%';
}

function unlockNav() {
    ['summary', 'roadmap', 'focus', 'exam'].forEach(id => {
        const btn = document.getElementById('btn-' + id);
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-30', 'cursor-not-allowed');
        }
    });
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('sidebar-collapsed');
    const icon = document.getElementById('toggle-icon');
    if (icon) icon.innerText = icon.innerText === '⇠' ? '⇢' : '⇠';
}

async function deleteCourse(id) {
    if (confirm("Delete this course?")) {
        try {
            const res = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (localStorage.getItem('lastCourseId') === id) localStorage.removeItem('lastCourseId');
                loadHistory();
                if (currentCourseId === id) { currentCourseId = null; showScreen('upload'); }
            }
        } catch (e) { console.error("Delete error:", e); }
    }
}

function celebration(score, total) {
    const percent = (score / total) * 100;
    let message = "";
    let subMessage = "";

    if (percent === 100) {
        message = "🏆 ABSOLUTE MASTERY!";
        subMessage = "Wow! You're a genius! Not a single mistake. Go get some coffee, you earned it!";
        launchConfetti(200); // Много конфетти
    } else if (percent >= 80) {
        message = "🌟 BRILLIANT WORK!";
        subMessage = "You have a great grasp of this material. Almost perfect!";
        launchConfetti(100); // Средне конфетти
    } else if (percent >= 50) {
        message = "👍 GOOD JOB!";
        subMessage = "You passed! With a bit more focus, you'll hit that 100% next time.";
        launchConfetti(40); // Немного конфетти для поддержки
    } else {
        message = "📚 KEEP CLIMBING!";
        subMessage = "Not your best run, but every mistake is a lesson. Review the summary and try again!";
    }

    return { title: message, text: subMessage };
}

function launchConfetti(count) {
    confetti({
        particleCount: count,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#a855f7', '#ec4899', '#22c55e']
    });
}

function generateOutline() {
    const content = document.getElementById('summaryContent');
    const outlineNav = document.getElementById('summaryOutline'); // Исправленный ID

    if (!content || !outlineNav) return;

    const headers = content.querySelectorAll('h2, h3');
    outlineNav.innerHTML = ""; // Очищаем старое меню

    if (headers.length === 0) {
        outlineNav.innerHTML = '<p class="text-xs text-slate-300 italic">No headings found yet...</p>';
        return;
    }

    headers.forEach((header, index) => {
        const id = `summary-h-${index}`;
        header.id = id; // Назначаем ID заголовку

        const link = document.createElement('a');
        link.href = `#${id}`;
        link.innerText = header.innerText;

        const isH3 = header.tagName === 'H3';
        link.className = `block py-2 text-sm font-bold transition-all hover:text-indigo-600 cursor-pointer ${
            isH3 ? 'pl-4 text-slate-400 font-medium' : 'text-slate-600'
        }`;

        link.onclick = (e) => {
            e.preventDefault();
            header.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        outlineNav.appendChild(link);
    });
}

// --- ФУНКЦИЯ ЭКСПОРТА PDF ---
function exportToPDF() {
    const isStudyScreen = !document.getElementById('screen-study').classList.contains('hidden');
    let fileName = "Study-Fit_Document";

    if (isStudyScreen) {
        // Если мы в Roadmap (экран обучения)
        const topicTitle = document.getElementById('study-topic-title')?.innerText;
        fileName = `Lesson_${topicTitle || 'Topic'}`;
    } else {
        // Если мы в общем Summary
        fileName = "Lecture_Summary";
    }

    // Сохраняем старый заголовок и ставим новый (он станет именем PDF файла)
    const oldTitle = document.title;
    document.title = fileName;

    // Запускаем печать
    window.print();

    // Возвращаем заголовок назад
    setTimeout(() => {
        document.title = oldTitle;
    }, 500);
}

window.onload = async () => {
    const token = localStorage.getItem('study_fit_token');
    const authOverlay = document.getElementById('auth-overlay');

    if (token) {
        if (authOverlay) authOverlay.classList.add('hidden');
        await loadHistory();
        const savedId = localStorage.getItem('lastCourseId');
        if (savedId) await loadSpecificCourse(savedId);
    } else {
        if (authOverlay) authOverlay.classList.remove('hidden');
    }
};