// lahat ng variables 
let currentStrand = '';
let currentSubject = '';
let currentMode = '';
let currentQuestionIndex = 0;
let score = 0;
let userAnswers = [];
let quizQuestions = [];
let timerInterval;
let startTime;
let elapsedTime = 0;
let currentUser = null;
let sessionReady = Promise.resolve(null);
let aiUploadedDocuments = [];
let aiLastGenerated = null;

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initAiGenerator();

    if (typeof DB === 'undefined') {
        applyIncomingStrandFromUrl();
        return;
    }

    sessionReady = DB.checkSession()
        .then(user => {
            currentUser = user;
            refreshNavbarUser();
            loadAiDocumentsFromServer();
            applyIncomingStrandFromUrl();
            return user;
        })
        .catch(() => {
            currentUser = null;
            refreshNavbarUser();
            applyIncomingStrandFromUrl();
            return null;
        });
});

function initNavbar() {
    const lang = (typeof DB !== 'undefined' && DB.lang) ? DB.lang() : (localStorage.getItem('qm_lang') || 'EN');
    const theme = (typeof DB !== 'undefined' && DB.theme) ? DB.theme() : (localStorage.getItem('qm_theme') || 'light');
    applyLanguage(lang);
    applyTheme(theme);
    refreshNavbarUser();
}

function initAiGenerator() {
    const input = document.getElementById('aiDocsInput');
    const uploadBtn = document.getElementById('aiUploadBtn');
    const generateBtn = document.getElementById('aiGenerateBtn');
    const selectedCount = document.getElementById('aiSelectedCount');

    if (!input || !uploadBtn || !generateBtn) return;

    input.addEventListener('change', () => {
        const count = input.files ? input.files.length : 0;
        selectedCount.textContent = count ? `${count} file(s) selected` : 'No files selected';
    });

    uploadBtn.addEventListener('click', async () => {
        if (!currentUser) {
            notify('Please sign in before uploading documents.', 'error');
            return;
        }

        const files = Array.from(input.files || []);
        if (!files.length) {
            notify('Please select at least one document.', 'error');
            return;
        }

        if ((aiUploadedDocuments.length + files.length) > 20) {
            notify('You can only upload up to 20 documents.', 'error');
            return;
        }

        setAiStatus('Uploading and parsing documents...');
        uploadBtn.disabled = true;
        try {
            const data = await DB.uploadDocuments(files);
            aiUploadedDocuments = aiUploadedDocuments.concat(data.documents || []);
            renderUploadedDocuments();
            input.value = '';
            selectedCount.textContent = 'No files selected';
            setAiStatus(`Uploaded ${data.documents.length} document(s).`);
        } catch (err) {
            setAiStatus((err && err.message) || 'Upload failed.');
            notify((err && err.message) || 'Upload failed.', 'error');
        } finally {
            uploadBtn.disabled = false;
        }
    });

    generateBtn.addEventListener('click', async () => {
        if (!currentUser) {
            notify('Please sign in before generating quizzes.', 'error');
            return;
        }

        const confirm = document.getElementById('aiConfirmModules');
        if (!confirm || !confirm.checked) {
            notify('Please confirm that your modules are complete before generation.', 'error');
            return;
        }

        if (!aiUploadedDocuments.length) {
            notify('Upload at least one document first.', 'error');
            return;
        }

        const mode = (document.getElementById('aiModeSelect') || {}).value || 'Quiz';
        const qCount = Math.min(Math.max(parseInt((document.getElementById('aiQuestionCount') || {}).value, 10) || 20, 5), 30);
        const docIds = aiUploadedDocuments.map(d => d.id);

        generateBtn.disabled = true;
        setAiStatus('Generating medium-difficult questions with Gemini...');
        try {
            const result = await DB.generateAiQuiz(docIds, qCount, mode);
            aiLastGenerated = result;
            setAiStatus(`Generated ${result.questionCount} questions. Launching ${mode}...`);
            launchAiQuiz(result, mode);
        } catch (err) {
            setAiStatus((err && err.message) || 'Generation failed.');
            notify((err && err.message) || 'Generation failed.', 'error');
        } finally {
            generateBtn.disabled = false;
        }
    });

    renderUploadedDocuments();
}

function setAiStatus(text) {
    const status = document.getElementById('aiStatus');
    if (status) status.textContent = text || '';
}

function renderUploadedDocuments() {
    const wrap = document.getElementById('aiUploadedList');
    if (!wrap) return;

    if (!aiUploadedDocuments.length) {
        wrap.innerHTML = '<span class="ai-doc-chip">No uploaded modules yet</span>';
        return;
    }

    wrap.innerHTML = aiUploadedDocuments.map(doc =>
        `<span class="ai-doc-chip">${escapeHtml(doc.originalName || doc.original_name || 'Document')}</span>`
    ).join('');
}

async function loadAiDocumentsFromServer() {
    if (!currentUser || typeof DB === 'undefined' || !DB.getUploadedDocuments) return;
    try {
        const data = await DB.getUploadedDocuments(20, 0);
        aiUploadedDocuments = data.documents || [];
        renderUploadedDocuments();
    } catch (_) {
        // Ignore fetch errors and keep local state empty.
    }
}

function launchAiQuiz(result, mode) {
    const generatedQuestions = (result.questions || []).map(q => ({
        question: q.question,
        answers: q.choices,
        correctAnswer: q.answerIndex,
    }));

    if (!generatedQuestions.length) {
        notify('No generated questions found.', 'error');
        return;
    }

    currentStrand = 'AI-' + result.quizId;
    currentSubject = result.title || 'Document Quiz';
    currentMode = mode;
    currentQuestionIndex = 0;
    score = 0;
    userAnswers = [];

    if (mode === 'Review') {
        const wrongAnswers = getWrongAnswers(currentStrand, currentSubject);
        if (!wrongAnswers.length) {
            notify('No wrong answers yet for this generated quiz. Try Practice first.', 'error');
            return;
        }
        quizQuestions = generatedQuestions.filter(q => wrongAnswers.some(w => w.question === q.question));
        if (!quizQuestions.length) {
            notify('No review questions available for this generated quiz.', 'error');
            return;
        }
    } else {
        quizQuestions = shuffleArray(generatedQuestions);
    }

    document.getElementById('quizTitle').textContent = `AI • ${currentSubject}`;
    document.getElementById('totalQuestions').textContent = quizQuestions.length;
    document.getElementById('totalScore').textContent = quizQuestions.length;

    hideAllPages();
    document.getElementById('quizPage').classList.remove('hidden');
    startTimer();
    displayQuestion();
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.src = theme === 'dark' ? '../assets/images/homepage/darkmode.png' : '../assets/images/homepage/light.png';
    }
}

function applyLanguage(lang) {
    const attr = lang === 'FIL' ? 'data-fil' : 'data-en';
    const recentLang = document.getElementById('recentLang');
    const btnEN = document.getElementById('btnEN');
    const btnFIL = document.getElementById('btnFIL');

    if (recentLang) recentLang.textContent = lang;
    if (btnEN) btnEN.classList.toggle('lang-active', lang === 'EN');
    if (btnFIL) btnFIL.classList.toggle('lang-active', lang === 'FIL');

    document.querySelectorAll('[data-en]').forEach(el => {
        const text = el.getAttribute(attr);
        if (text !== null) el.textContent = text;
    });
}

function refreshNavbarUser() {
    const label = document.getElementById('userBtnLabel');
    const initial = document.getElementById('userInitial');
    if (!label || !initial) return;

    if (currentUser) {
        label.textContent = currentUser.username || currentUser.fullName || 'User';
        initial.textContent = (currentUser.username || currentUser.fullName || 'U').charAt(0).toUpperCase();
    } else {
        label.textContent = 'Log In';
        initial.innerHTML = '<img src="../assets/images/homepage/profile.png" alt="profile">';
    }
}

window.showHome = function () {
    window.location.href = '../homepage.html';
};

window.toggleMobileMenu = function () {
    const nav = document.getElementById('navlinks');
    if (nav) nav.classList.toggle('open');
};

window.toggleLanguage = function (event) {
    if (event) event.stopPropagation();
    const picker = document.getElementById('selectLang');
    if (picker) picker.classList.toggle('active');
};

window.setLanguage = function (lang, event) {
    if (event) event.stopPropagation();
    if (typeof DB !== 'undefined' && DB.saveLang) {
        DB.saveLang(lang);
    } else {
        localStorage.setItem('qm_lang', lang);
    }
    applyLanguage(lang);
    const picker = document.getElementById('selectLang');
    if (picker) picker.classList.remove('active');
};

document.addEventListener('click', () => {
    const picker = document.getElementById('selectLang');
    if (picker) picker.classList.remove('active');
});

window.toggleDarkMode = function () {
    const current = (typeof DB !== 'undefined' && DB.theme) ? DB.theme() : (localStorage.getItem('qm_theme') || 'light');
    const next = current === 'light' ? 'dark' : 'light';

    if (typeof DB !== 'undefined' && DB.saveTheme) {
        DB.saveTheme(next);
    } else {
        localStorage.setItem('qm_theme', next);
    }

    applyTheme(next);
};

window.handleHelpSupport = function () {
    const lang = (typeof DB !== 'undefined' && DB.lang) ? DB.lang() : (localStorage.getItem('qm_lang') || 'EN');
    notify(lang === 'FIL' ? 'Pakikontak: support@quizmaster.com' : 'Contact: support@quizmaster.com', 'info');
};

window.handleUserBtn = async function () {
    if (!currentUser) {
        window.location.href = '../login.html';
        return;
    }

    try {
        if (typeof DB !== 'undefined' && DB.logout) {
            await DB.logout();
        }
    } finally {
        currentUser = null;
        refreshNavbarUser();
        notify('Logged out.', 'success');
        setTimeout(() => {
            window.location.href = '../homepage.html';
        }, 800);
    }
};

window.goToDashboard = function (event) {
    if (currentUser) {
        window.location.href = '../dashboard.html';
        return true;
    }

    if (event) event.preventDefault();
    const lang = (typeof DB !== 'undefined' && DB.lang) ? DB.lang() : (localStorage.getItem('qm_lang') || 'EN');
    notify(lang === 'FIL' ? 'Mag-sign in muna upang makita ang dashboard.' : 'Please sign in first to view your dashboard.', 'error');
    setTimeout(() => {
        window.location.href = '../login.html';
    }, 1200);
    return false;
};

function applyIncomingStrandFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get('strand') || '').toUpperCase();
    if (!requested || !strandSubjects[requested]) {
        return;
    }
    selectStrand(requested);
}

// mapping ng strand sa subjects nila
const strandSubjects = {
    'STEM': ['General Mathematics', 'General Statistics', 'General Calculus', 'General Physics', 'General Chemistry', 'General Biology'],
    'ABM': ['Business Math', 'Fundamentals of Accountancy', 'Business Finance', 'Organization and Management', 'Business Marketing', 'Business Ethics'],
    'HUMSS': ['Creative Writing', 'Disciplines and Ideas', 'Trends and Issues', 'Philippine Politics', 'Community Engagement', 'World Religions'],
    'TVL': ['Technical Drafting', 'Electronics', 'Carpentry', 'Plumbing', 'Tile Setting', 'Masonry'],
    'TRM': ['Tourism Promotion', 'Tour Guiding', 'Events Management', 'Travel Services', 'Cruise Ship Management', 'Local Guiding'],
    'CPG': ['Computer Programming', 'Web Development', 'Animation', 'Illustration', 'Computer Systems', 'Java Programming'],
    'CSS': ['CSS Fundamentals', 'Computer Hardware', 'Network Configuration', 'Contact Center', 'Computer Systems Servicing', 'Network Cabling'],
    'HRS': ['Cookery', 'Bread and Pastry', 'Food and Beverage', 'Housekeeping', 'Front Office', 'Tour Guiding'],
    'SPT': ['Athletics', 'Arnis', 'Basketball', 'Volleyball', 'Badminton', 'Table Tennis']
};

// sa navigation dito sa baba

// pang tago ng page
function hideAllPages() {
    document.getElementById('strandPage').classList.add('hidden');
    document.getElementById('subjectsPage').classList.add('hidden');
    document.getElementById('difficultyPage').classList.add('hidden');
    document.getElementById('quizPage').classList.add('hidden');
    document.getElementById('resultsPage').classList.add('hidden');
}

// pag pili ng strand
function selectStrand(strand) {
    currentStrand = strand;
    document.getElementById('selectedStrand').textContent = strand;
    
    // load ang subjects ng strand
    loadSubjects(strand);
    
    hideAllPages();
    document.getElementById('subjectsPage').classList.remove('hidden');
}

// load subjects base sa strand
function loadSubjects(strand) {
    const subjectsGrid = document.getElementById('subjectsGrid');
    subjectsGrid.innerHTML = '';
    
    const subjects = strandSubjects[strand];
    
    subjects.forEach(subject => {
        const subjectCard = document.createElement('div');
        subjectCard.className = 'subject-card';
        subjectCard.onclick = () => selectSubject(subject);
        
        subjectCard.innerHTML = `
            <div class="subject-icon" aria-hidden="true">
                <span class="material-symbols-rounded">menu_book</span>
            </div>
            <h4>${subject}</h4>
        `;
        
        subjectsGrid.appendChild(subjectCard);
    });
}

// balik sa strands
function backToStrands() {
    hideAllPages();
    document.getElementById('strandPage').classList.remove('hidden');
}

// balik sa subjects
function backToSubjects() {
    stopTimer();
    hideAllPages();
    document.getElementById('subjectsPage').classList.remove('hidden');
}

// balik sa difficulty/mode selection
function backToDifficulty() {
    stopTimer();
    hideAllPages();
    document.getElementById('difficultyPage').classList.remove('hidden');
}

// pag pili ng subject, pakita mode selection
function selectSubject(subject) {
    currentSubject = subject;
    document.getElementById('selectedSubject').textContent = subject;
    
    hideAllPages();
    document.getElementById('difficultyPage').classList.remove('hidden');
}

// simulan ang quiz based sa mode (Start Quiz, Practice, or Review)
async function startQuiz(mode) {
    if (sessionReady) {
        await sessionReady;
    }

    if (!currentUser) {
        notify('Please sign in first to save your quiz progress.', 'error');
        setTimeout(() => {
            window.location.href = '../login.html';
        }, 1000);
        return;
    }

    currentMode = mode;
    currentQuestionIndex = 0;
    score = 0;
    userAnswers = [];
    
    document.getElementById('quizTitle').textContent = `${currentStrand} - ${currentSubject}`;
    
    // kunan questions from bank
    let allQuestions = getQuestionBank(currentStrand, currentSubject);
    
    if (mode === 'Review') {
        // para sa review mode, kunin lang yung wrong answers
        const wrongAnswers = getWrongAnswers(currentStrand, currentSubject);
        
        if (wrongAnswers.length === 0) {
            alert('No wrong answers yet! Try Practice mode first to build your review bank.');
            return;
        }
        
        // filter questions na nandun sa wrong answers list
        quizQuestions = allQuestions.filter(q => 
            wrongAnswers.some(wa => wa.question === q.question)
        );
    } else {
        // Start Quiz or Practice mode - lahat ng questions
        quizQuestions = [...allQuestions];
    }
    
    // shuffle questions para random
    quizQuestions = shuffleArray(quizQuestions);
    
    // shuffle answers ng bawat question
    quizQuestions = quizQuestions.map(q => shuffleAnswers(q));
    
    // update total questions display
    document.getElementById('totalQuestions').textContent = quizQuestions.length;
    document.getElementById('totalScore').textContent = quizQuestions.length;
    
    hideAllPages();
    document.getElementById('quizPage').classList.remove('hidden');
    
    // pang start ng timer
    startTimer();
    
    // pang display ng question
    displayQuestion();
}

// shuffle array function (Fisher-Yates algorithm)
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// shuffle answers pero itago correct answer
function shuffleAnswers(question) {
    const correctAnswerText = question.answers[question.correctAnswer];
    
    const shuffledAnswers = shuffleArray([...question.answers]);
    
    const newCorrectIndex = shuffledAnswers.indexOf(correctAnswerText);
    
    return {
        ...question,
        answers: shuffledAnswers,
        correctAnswer: newCorrectIndex
    };
}

// kunan wrong answers from localStorage
function getWrongAnswers(strand, subject) {
    const key = `wrongAnswers_${strand}_${subject}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
}

// save wrong answer sa localStorage
function saveWrongAnswer(strand, subject, question) {
    const key = `wrongAnswers_${strand}_${subject}`;
    let wrongAnswers = getWrongAnswers(strand, subject);
    
    // check kung nandun na yung question
    const exists = wrongAnswers.some(wa => wa.question === question.question);
    
    if (!exists) {
        wrongAnswers.push({
            question: question.question,
            answers: question.answers,
            correctAnswer: question.correctAnswer
        });
        localStorage.setItem(key, JSON.stringify(wrongAnswers));
    }
}

// tanggalin wrong answer sa localStorage pag na-answer na ng tama
function removeWrongAnswer(strand, subject, question) {
    const key = `wrongAnswers_${strand}_${subject}`;
    let wrongAnswers = getWrongAnswers(strand, subject);
    
    wrongAnswers = wrongAnswers.filter(wa => wa.question !== question.question);
    localStorage.setItem(key, JSON.stringify(wrongAnswers));
}

// question bank - EDITABLE DITO (same as before, automatically used by all modes)
function getQuestionBank(strand, subject) {
    // STEM - General Mathematics
    if (strand === 'STEM' && subject === 'General Mathematics') {
        return [
            {question: 'What is the value of π (pi) approximately?', answers: ['3.14159', '2.71828', '1.61803', '4.66920'], correctAnswer: 0},
            {question: 'What is the square root of 144?', answers: ['10', '11', '12', '13'], correctAnswer: 2},
            {question: 'What is 25% of 200?', answers: ['25', '50', '75', '100'], correctAnswer: 1},
            {question: 'What is the sum of angles in a triangle?', answers: ['90 degrees', '180 degrees', '270 degrees', '360 degrees'], correctAnswer: 1},
            {question: 'What is 2 to the power of 5?', answers: ['10', '25', '32', '64'], correctAnswer: 2},
            {question: 'What is the formula for the area of a circle?', answers: ['πr²', '2πr', 'πd', 'r²'], correctAnswer: 0},
            {question: 'What is the derivative of x²?', answers: ['x', '2x', 'x²', '2'], correctAnswer: 1},
            {question: 'What is the slope of a horizontal line?', answers: ['0', '1', 'Undefined', 'Infinity'], correctAnswer: 0},
            {question: 'What is 7 × 8?', answers: ['54', '56', '58', '60'], correctAnswer: 1},
            {question: 'What is the value of sin(90°)?', answers: ['0', '0.5', '1', 'Undefined'], correctAnswer: 2},
            {question: 'What is the Pythagorean theorem?', answers: ['a + b = c', 'a² + b² = c²', 'a × b = c', 'a/b = c'], correctAnswer: 1},
            {question: 'What is 15% of 300?', answers: ['30', '35', '40', '45'], correctAnswer: 3},
            {question: 'What is the perimeter of a square with side 5?', answers: ['10', '15', '20', '25'], correctAnswer: 2},
            {question: 'What is the value of cos(0°)?', answers: ['0', '0.5', '1', 'Undefined'], correctAnswer: 2},
            {question: 'What is the volume of a cube with side 3?', answers: ['9', '18', '27', '81'], correctAnswer: 2},
            {question: 'What is 3⁴?', answers: ['12', '27', '64', '81'], correctAnswer: 3},
            {question: 'What is the sum of 1 + 2 + 3 + 4 + 5?', answers: ['10', '12', '15', '20'], correctAnswer: 2},
            {question: 'What is the area of a rectangle 4×6?', answers: ['10', '20', '24', '30'], correctAnswer: 2},
            {question: 'What is √225?', answers: ['13', '14', '15', '16'], correctAnswer: 2},
            {question: 'What is 72 ÷ 8?', answers: ['7', '8', '9', '10'], correctAnswer: 2}
        ];
    }
    
    // STEM - Statistics
    if (strand === 'STEM' && subject === 'General Statistics') {
        return [
            {question: 'What is the mean of 2, 4, 6, 8?', answers: ['4', '5', '6', '7'], correctAnswer: 1},
            {question: 'What is the median of 1, 3, 5, 7, 9?', answers: ['3', '5', '7', '9'], correctAnswer: 1},
            {question: 'What is the mode of 2, 2, 3, 4, 4, 4, 5?', answers: ['2', '3', '4', '5'], correctAnswer: 2},
            {question: 'What does SD stand for in statistics?', answers: ['Standard Deviation', 'Statistical Data', 'Sample Distribution', 'Segment Division'], correctAnswer: 0},
            {question: 'What is the range of 10, 15, 20, 25, 30?', answers: ['10', '15', '20', '25'], correctAnswer: 2},
            {question: 'What is probability expressed as?', answers: ['Percentage only', 'Decimal only', 'Fraction only', 'All of the above'], correctAnswer: 3},
            {question: 'What is the sum of probabilities in any event?', answers: ['0', '0.5', '1', '2'], correctAnswer: 2},
            {question: 'What is a population in statistics?', answers: ['A group of people', 'All members of a defined group', 'A sample', 'A variable'], correctAnswer: 1},
            {question: 'What is variance related to?', answers: ['Mean', 'Median', 'Standard Deviation', 'Mode'], correctAnswer: 2},
            {question: 'What type of data is age?', answers: ['Nominal', 'Ordinal', 'Interval', 'Ratio'], correctAnswer: 3},
            {question: 'What is the average of 10, 20, 30?', answers: ['15', '20', '25', '30'], correctAnswer: 1},
            {question: 'What is correlation?', answers: ['Relationship between variables', 'Type of graph', 'Statistical error', 'Data collection'], correctAnswer: 0},
            {question: 'What is a sample?', answers: ['Entire population', 'Subset of population', 'Type of data', 'Statistical method'], correctAnswer: 1},
            {question: 'What is the median of 2, 4, 6?', answers: ['2', '3', '4', '5'], correctAnswer: 2},
            {question: 'What does z-score measure?', answers: ['Central tendency', 'Standard deviations from mean', 'Sample size', 'Probability'], correctAnswer: 1},
            {question: 'What is qualitative data?', answers: ['Numerical data', 'Descriptive data', 'Continuous data', 'Discrete data'], correctAnswer: 1},
            {question: 'What is quantitative data?', answers: ['Descriptive data', 'Numerical data', 'Categorical data', 'Nominal data'], correctAnswer: 1},
            {question: 'What is the purpose of a histogram?', answers: ['Show relationships', 'Display frequency distribution', 'Compare categories', 'Show trends'], correctAnswer: 1},
            {question: 'What is standard deviation?', answers: ['Measure of spread', 'Measure of center', 'Type of average', 'Data point'], correctAnswer: 0},
            {question: 'What is an outlier?', answers: ['Average value', 'Extreme value', 'Middle value', 'Common value'], correctAnswer: 1}
        ];
    }
    // STEM - Calculus
    if (strand === 'STEM' && subject === 'General Calculus') {
        return [
            {question: 'What is the limit of (x^2 - 1) / (x - 1) as x approaches 1?', answers: ['0', '1', '2', 'Undefined'], correctAnswer: 2},
            {question: 'What is the derivative of f(x) = sin(x)?', answers: ['cos(x)', '-cos(x)', 'tan(x)', 'sec^2(x)'], correctAnswer: 0},
            {question: 'What rule is used to differentiate a product of two functions?', answers: ['Chain Rule', 'Power Rule', 'Product Rule', 'Quotient Rule'], correctAnswer: 2},
            {question: 'What is the derivative of a constant value?', answers: ['1', 'x', 'The constant itself', '0'], correctAnswer: 3},
            {question: 'According to the Power Rule, what is the derivative of x^n?', answers: ['nx^(n-1)', 'x^(n+1)', 'n*x', 'nx^n'], correctAnswer: 0},
            {question: 'What is the derivative of e^x?', answers: ['xe^(x-1)', 'e^x', 'ln(x)', '1/x'], correctAnswer: 1},
            {question: 'The Slope of a tangent line at a point is given by the:', answers: ['Integral', 'Derivative', 'Limit definition', 'Average rate of change'], correctAnswer: 1},
            {question: 'What is the integral of 1/x dx?', answers: ['x', 'ln|x| + C', 'e^x', '-1/x^2'], correctAnswer: 1},
            {question: 'What does the First Derivative Test help determine?', answers: ['Concavity', 'Inflection points', 'Relative extrema', 'Area under a curve'], correctAnswer: 2},
            {question: 'What is the derivative of ln(x)?', answers: ['e^x', '1/x', 'x', '1'], correctAnswer: 1},
            {question: 'What is the derivative of f(x) = tan(x)?', answers: ['sec(x)', 'sec^2(x)', 'cos^2(x)', 'sin(x)'], correctAnswer: 1},
            {question: 'The process of finding the area under a curve is called:', answers: ['Differentiation', 'Integration', 'Optimization', 'Linearization'], correctAnswer: 1},
            {question: 'What rule is used to find the derivative of a composite function f(g(x))?', answers: ['Power Rule', 'Chain Rule', 'Sum Rule', 'Product Rule'], correctAnswer: 1},
            {question: 'If the second derivative is positive on an interval, the function is:', answers: ['Decreasing', 'Concave down', 'Concave up', 'Linear'], correctAnswer: 2},
            {question: 'What is the limit of 1/x as x approaches infinity?', answers: ['Infinity', '1', '0', '-Infinity'], correctAnswer: 2},
            {question: 'What is the derivative of cos(x)?', answers: ['sin(x)', '-sin(x)', '-cos(x)', 'sec(x)'], correctAnswer: 1},
            {question: 'The Fundamental Theorem of Calculus relates which two concepts?', answers: ['Limits and Continuity', 'Differentiation and Integration', 'Algebra and Geometry', 'Slope and Intercept'], correctAnswer: 1},
            {question: 'What is the integral of x dx?', answers: ['x^2 + C', '(1/2)x^2 + C', '1', '2x'], correctAnswer: 1},
            {question: 'A point where the concavity changes is called a/an:', answers: ['Critical point', 'Inflection point', 'Maximum', 'Minimum'], correctAnswer: 1},
            {question: 'What is the derivative of 5x^3?', answers: ['15x^2', '5x^2', '15x^3', '3x^2'], correctAnswer: 0}
        ];
    }
    // STEM - Physics
    if (strand === 'STEM' && subject === 'General Physics') {
        return [
            {question: 'What is the standard unit of force in the SI system?', answers: ['Joule', 'Watt', 'Newton', 'Pascal'], correctAnswer: 2},
            {question: 'Which law states that an object at rest stays at rest unless acted upon by a force?', answers: ['First Law', 'Second Law', 'Third Law', 'Law of Gravity'], correctAnswer: 0},
            {question: 'What is the acceleration due to gravity on Earth (approximate)?', answers: ['5.8 m/s²', '9.8 m/s²', '12.0 m/s²', '3.0 x 10^8 m/s²'], correctAnswer: 1},
            {question: 'What is the formula for work done?', answers: ['W = m*g', 'W = F*d', 'W = m*v', 'W = P/t'], correctAnswer: 1},
            {question: 'Which of the following is a vector quantity?', answers: ['Mass', 'Temperature', 'Velocity', 'Time'], correctAnswer: 2},
            {question: 'What is the rate of change of displacement called?', answers: ['Acceleration', 'Speed', 'Velocity', 'Momentum'], correctAnswer: 2},
            {question: 'In a vacuum, which hits the ground first: a feather or a hammer?', answers: ['Hammer', 'Feather', 'Both at the same time', 'Neither'], correctAnswer: 2},
            {question: 'What is the product of an object\'s mass and its velocity?', answers: ['Force', 'Work', 'Kinetic Energy', 'Momentum'], correctAnswer: 3},
            {question: 'Energy due to an object\'s motion is called:', answers: ['Potential Energy', 'Thermal Energy', 'Kinetic Energy', 'Chemical Energy'], correctAnswer: 2},
            {question: 'The tendency of an object to resist changes in its state of motion is:', answers: ['Inertia', 'Friction', 'Gravity', 'Acceleration'], correctAnswer: 0},
            {question: 'What is the power dissipated if 100J of work is done in 5 seconds?', answers: ['500W', '20W', '50W', '10W'], correctAnswer: 1},
            {question: 'For every action, there is an equal and opposite reaction. This is Newton\'s:', answers: ['First Law', 'Second Law', 'Third Law', 'Fourth Law'], correctAnswer: 2},
            {question: 'What happens to the gravitational force between two masses if the distance doubles?', answers: ['It doubles', 'It stays the same', 'It is halved', 'It is quartered'], correctAnswer: 3},
            {question: 'Which of the following is the unit for electrical resistance?', answers: ['Volt', 'Ampere', 'Ohm', 'Coulomb'], correctAnswer: 2},
            {question: 'What type of wave is sound?', answers: ['Longitudinal', 'Transverse', 'Electromagnetic', 'Surface'], correctAnswer: 0},
            {question: 'What is the speed of light in a vacuum?', answers: ['300,000 m/s', '3.0 x 10^8 m/s', '9.8 m/s', '1,100 ft/s'], correctAnswer: 1},
            {question: 'The bending of light as it passes from one medium to another is:', answers: ['Reflection', 'Refraction', 'Diffraction', 'Polarization'], correctAnswer: 1},
            {question: 'What is the primary source of energy for the Earth?', answers: ['Geothermal', 'The Sun', 'Nuclear Power', 'Wind'], correctAnswer: 1},
            {question: 'In a circuit, if voltage increases and resistance stays the same, current:', answers: ['Decreases', 'Stays the same', 'Increases', 'Drops to zero'], correctAnswer: 2},
            {question: 'What does a concave lens do to parallel light rays?', answers: ['Converges them', 'Diverges them', 'Absorbs them', 'Reflects them'], correctAnswer: 1}
        ];
    }
    // STEM - Chemistry
    if (strand === 'STEM' && subject === 'General Chemistry') {
        return [
            {question: 'What is the smallest unit of an element that retains its chemical properties?', answers: ['Molecule', 'Atom', 'Proton', 'Neutron'], correctAnswer: 1},
            {question: 'What is the atomic number of an element based on?', answers: ['Number of neutrons', 'Total mass', 'Number of protons', 'Number of electrons'], correctAnswer: 2},
            {question: 'Which of the following subatomic particles has a negative charge?', answers: ['Proton', 'Neutron', 'Electron', 'Nucleus'], correctAnswer: 2},
            {question: 'Which type of bond involves the sharing of electron pairs between atoms?', answers: ['Ionic bond', 'Hydrogen bond', 'Metallic bond', 'Covalent bond'], correctAnswer: 3},
            {question: 'What is the value of Avogadro\'s number?', answers: ['6.022 x 10^23', '3.14 x 10^23', '1.602 x 10^-19', '9.8 x 10^21'], correctAnswer: 0},
            {question: 'A substance with a pH of 3 is considered:', answers: ['Neutral', 'Basic', 'Acidic', 'Alkaline'], correctAnswer: 2},
            {question: 'What is the molar mass of Water (H2O) approximately?', answers: ['12 g/mol', '16 g/mol', '18 g/mol', '22 g/mol'], correctAnswer: 2},
            {question: 'Which state of matter has a definite volume but takes the shape of its container?', answers: ['Solid', 'Liquid', 'Gas', 'Plasma'], correctAnswer: 1},
            {question: 'In the periodic table, what are the horizontal rows called?', answers: ['Groups', 'Periods', 'Families', 'Sections'], correctAnswer: 1},
            {question: 'Which law states that mass is neither created nor destroyed in a chemical reaction?', answers: ['Boyle\'s Law', 'Law of Conservation of Mass', 'Charles\'s Law', 'Avogadro\'s Law'], correctAnswer: 1},
            {question: 'What is the most abundant gas in Earth\'s atmosphere?', answers: ['Oxygen', 'Carbon Dioxide', 'Hydrogen', 'Nitrogen'], correctAnswer: 3},
            {question: 'What process involves a solid changing directly into a gas?', answers: ['Evaporation', 'Condensation', 'Sublimation', 'Melting'], correctAnswer: 2},
            {question: 'Which element is known as the "building block of life"?', answers: ['Oxygen', 'Nitrogen', 'Carbon', 'Iron'], correctAnswer: 2},
            {question: 'What is the charge of a cation?', answers: ['Neutral', 'Positive', 'Negative', 'Variable'], correctAnswer: 1},
            {question: 'Which gas law relates volume and temperature at constant pressure?', answers: ['Boyle\'s Law', 'Charles\'s Law', 'Dalton\'s Law', 'Graham\'s Law'], correctAnswer: 1},
            {question: 'What is the universal solvent?', answers: ['Alcohol', 'Oil', 'Water', 'Benzene'], correctAnswer: 2},
            {question: 'What is the name for the electrons in the outermost shell of an atom?', answers: ['Core electrons', 'Valence electrons', 'Free electrons', 'Paired electrons'], correctAnswer: 1},
            {question: 'What type of reaction releases energy in the form of heat?', answers: ['Endothermic', 'Exothermic', 'Decomposition', 'Synthesis'], correctAnswer: 1},
            {question: 'Which part of the atom contains the most mass?', answers: ['Electron cloud', 'Orbitals', 'Nucleus', 'Outer shell'], correctAnswer: 2},
            {question: 'What is the pH of pure water at room temperature?', answers: ['1', '5', '7', '14'], correctAnswer: 2}
        ];
    }
    // STEM - Biology
    if (strand === 'STEM' && subject === 'General Biology') {
        return [
            {question: 'What is often referred to as the "powerhouse of the cell"?', answers: ['Nucleus', 'Ribosome', 'Mitochondria', 'Lysosome'], correctAnswer: 2},
            {question: 'Which molecule carries the genetic instructions for life?', answers: ['ATP', 'RNA', 'DNA', 'Hemoglobin'], correctAnswer: 2},
            {question: 'What is the process by which plants convert sunlight into chemical energy?', answers: ['Respiration', 'Photosynthesis', 'Fermentation', 'Transpiration'], correctAnswer: 1},
            {question: 'Which organelle is responsible for protein synthesis?', answers: ['Golgi apparatus', 'Ribosome', 'Vacuole', 'Smooth ER'], correctAnswer: 1},
            {question: 'What is the basic unit of life?', answers: ['Atom', 'Organ', 'Tissue', 'Cell'], correctAnswer: 3},
            {question: 'In genetics, what is the term for a physical trait that is expressed?', answers: ['Genotype', 'Phenotype', 'Allele', 'Homozygous'], correctAnswer: 1},
            {question: 'Which process results in four genetically diverse haploid daughter cells?', answers: ['Mitosis', 'Binary Fission', 'Meiosis', 'Budding'], correctAnswer: 2},
            {question: 'Who is known as the father of modern genetics?', answers: ['Charles Darwin', 'Gregor Mendel', 'Louis Pasteur', 'Robert Hooke'], correctAnswer: 1},
            {question: 'What is the semi-permeable boundary of a cell called?', answers: ['Cell Wall', 'Cytoplasm', 'Plasma Membrane', 'Nuclear Envelope'], correctAnswer: 2},
            {question: 'Which nitrogenous base is found in RNA but NOT in DNA?', answers: ['Adenine', 'Thymine', 'Guanine', 'Uracil'], correctAnswer: 3},
            {question: 'What is the main sugar produced during photosynthesis?', answers: ['Fructose', 'Glucose', 'Sucrose', 'Lactose'], correctAnswer: 1},
            {question: 'Which type of cell lacks a membrane-bound nucleus?', answers: ['Eukaryotic', 'Prokaryotic', 'Animal Cell', 'Plant Cell'], correctAnswer: 1},
            {question: 'What is the movement of water across a semi-permeable membrane called?', answers: ['Diffusion', 'Active Transport', 'Osmosis', 'Endocytosis'], correctAnswer: 2},
            {question: 'In an ecosystem, what do you call an organism that makes its own food?', answers: ['Consumer', 'Decomposer', 'Autotroph', 'Heterotroph'], correctAnswer: 2},
            {question: 'Which phase of mitosis involves chromosomes lining up in the middle of the cell?', answers: ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'], correctAnswer: 1},
            {question: 'What are the different versions of a gene called?', answers: ['Chromatids', 'Alleles', 'Gametes', 'Mutations'], correctAnswer: 1},
            {question: 'Which organelle contains chlorophyll?', answers: ['Mitochondria', 'Chloroplast', 'Leucoplast', 'Chromoplast'], correctAnswer: 1},
            {question: 'What is the primary energy currency of the cell?', answers: ['Glucose', 'NADH', 'ATP', 'FADH2'], correctAnswer: 2},
            {question: 'What is the process of change in the heritable characteristics of biological populations over successive generations?', answers: ['Natural Selection', 'Evolution', 'Adaptation', 'Speciation'], correctAnswer: 1},
            {question: 'Which system in the human body is responsible for transporting oxygen and nutrients?', answers: ['Respiratory', 'Digestive', 'Circulatory', 'Endocrine'], correctAnswer: 2}
        ];
    }
    // ABM - Business Math
    if (strand === 'ABM' && subject === 'Business Math') {
        return [
            {question: 'What is 20% of 500?', answers: ['50', '75', '100', '125'], correctAnswer: 2},
            {question: 'What is simple interest formula?', answers: ['P×R×T', 'P×R/T', 'P/R×T', 'P+R+T'], correctAnswer: 0},
            {question: 'If you buy for ₱100 and sell for ₱150, what is profit?', answers: ['₱25', '₱30', '₱50', '₱75'], correctAnswer: 2},
            {question: 'What is markup?', answers: ['Selling price', 'Cost price', 'Difference between selling and cost', 'Discount amount'], correctAnswer: 2},
            {question: 'What is 10% discount on ₱1000?', answers: ['₱50', '₱100', '₱150', '₱200'], correctAnswer: 1},
            {question: 'What does ROI stand for?', answers: ['Return on Investment', 'Rate of Interest', 'Revenue of Income', 'Ratio of Items'], correctAnswer: 0},
            {question: 'If cost is ₱80 and markup is 25%, what is selling price?', answers: ['₱90', '₱95', '₱100', '₱105'], correctAnswer: 2},
            {question: 'What is net profit?', answers: ['Total sales', 'Gross profit - expenses', 'Revenue + expenses', 'Cost + markup'], correctAnswer: 1},
            {question: 'What is break-even point?', answers: ['Maximum profit', 'Zero profit/loss', 'Minimum sales', 'Maximum loss'], correctAnswer: 1},
            {question: 'If principal is ₱10,000, rate 5%, time 2 years, what is simple interest?', answers: ['₱500', '₱750', '₱1,000', '₱1,500'], correctAnswer: 2},
            {question: 'What is gross profit?', answers: ['Sales - cost', 'Sales + cost', 'Sales × cost', 'Sales / cost'], correctAnswer: 0},
            {question: 'What is commission rate if agent earns ₱5,000 from ₱100,000 sales?', answers: ['3%', '5%', '7%', '10%'], correctAnswer: 1},
            {question: 'What is depreciation?', answers: ['Increase in value', 'Decrease in value', 'Stable value', 'Initial value'], correctAnswer: 1},
            {question: 'If item costs ₱200 with 15% VAT, what is total?', answers: ['₱215', '₱220', '₱225', '₱230'], correctAnswer: 3},
            {question: 'What is net sales?', answers: ['Gross sales - returns', 'Gross sales + returns', 'Cost + profit', 'Revenue - expenses'], correctAnswer: 0},
            {question: 'What percentage is ₱25 of ₱200?', answers: ['10%', '12.5%', '15%', '20%'], correctAnswer: 1},
            {question: 'What is trade discount?', answers: ['Customer discount', 'Supplier to retailer discount', 'Employee discount', 'Seasonal discount'], correctAnswer: 1},
            {question: 'If you invest ₱50,000 and earn ₱5,000, what is ROI?', answers: ['5%', '10%', '15%', '20%'], correctAnswer: 1},
            {question: 'What is variable cost?', answers: ['Fixed regardless of production', 'Changes with production', 'One-time cost', 'Sunk cost'], correctAnswer: 1},
            {question: 'What is compound interest?', answers: ['Interest on principal only', 'Interest on principal and accumulated interest', 'Simple interest doubled', 'Fixed interest'], correctAnswer: 1}
        ];
    }
    // ABM - Fundamentals of Accountancy
    if (strand === 'ABM' && subject === 'Fundamentals of Accountancy') {
        return [
            {question: 'What is the basic accounting equation?', answers: ['Assets = Liabilities - Equity', 'Assets = Liabilities + Equity', 'Liabilities = Assets + Equity', 'Equity = Assets + Liabilities'], correctAnswer: 1},
            {question: 'Which financial statement reports a company\'s financial position at a specific point in time?', answers: ['Income Statement', 'Statement of Cash Flows', 'Balance Sheet', 'Retained Earnings Statement'], correctAnswer: 2},
            {question: 'What type of account is "Accounts Payable"?', answers: ['Asset', 'Liability', 'Equity', 'Revenue'], correctAnswer: 1},
            {question: 'In double-entry bookkeeping, an increase in an asset is recorded as a:', answers: ['Debit', 'Credit', 'Liability', 'Revenue'], correctAnswer: 0},
            {question: 'Which of the following is considered an intangible asset?', answers: ['Inventory', 'Equipment', 'Patents', 'Land'], correctAnswer: 2},
            {question: 'What is the primary purpose of the General Ledger?', answers: ['To record daily transactions', 'To summarize all accounts and balances', 'To list all employees', 'To calculate tax only'], correctAnswer: 1},
            {question: 'Which account type normally has a credit balance?', answers: ['Assets', 'Expenses', 'Dividends', 'Revenues'], correctAnswer: 3},
            {question: 'The process of transferring journal entries to the ledger is called:', answers: ['Summarizing', 'Adjusting', 'Posting', 'Analyzing'], correctAnswer: 2},
            {question: 'Which statement shows the profitability of a company over a period of time?', answers: ['Balance Sheet', 'Income Statement', 'Trial Balance', 'Audit Report'], correctAnswer: 1},
            {question: 'What does "liquidity" refer to?', answers: ['Company\'s total debt', 'Ability to pay short-term obligations', 'Total market value', 'Long-term profitability'], correctAnswer: 1},
            {question: 'What is the effect of owner’s withdrawal on equity?', answers: ['Increases equity', 'Decreases equity', 'No effect', 'Increases liabilities'], correctAnswer: 1},
            {question: 'Unearned revenue is classified as a/an:', answers: ['Asset', 'Revenue', 'Liability', 'Expense'], correctAnswer: 2},
            {question: 'The "matching principle" relates to:', answers: ['Matching assets with liabilities', 'Matching revenues with expenses', 'Matching debits with credits', 'Matching cash with bank statements'], correctAnswer: 1},
            {question: 'Which of the following is a temporary account?', answers: ['Rent Expense', 'Cash', 'Equipment', 'Accounts Receivable'], correctAnswer: 0},
            {question: 'What is the first step in the accounting cycle?', answers: ['Posting to ledger', 'Preparing a trial balance', 'Analyzing transactions', 'Journalizing'], correctAnswer: 2},
            {question: 'Accrued expenses are:', answers: ['Paid but not incurred', 'Incurred but not yet paid', 'Revenue earned', 'Cash purchases'], correctAnswer: 1},
            {question: 'What is "Depreciation"?', answers: ['The increase in asset value', 'The systematic allocation of a long-term asset\'s cost', 'A cash expense', 'The sale of an asset'], correctAnswer: 1},
            {question: 'Which of the following is a contra-asset account?', answers: ['Accumulated Depreciation', 'Owner\'s Capital', 'Sales Returns', 'Notes Payable'], correctAnswer: 0},
            {question: 'What is the purpose of a Trial Balance?', answers: ['To ensure debits equal credits', 'To calculate net income', 'To list all customers', 'To pay taxes'], correctAnswer: 0},
            {question: 'If Assets are 100,000 and Liabilities are 40,000, what is Equity?', answers: ['140,000', '60,000', '100,000', '40,000'], correctAnswer: 1}
        ];
    }
    // ABM - Business Finance
    if (strand === 'ABM' && subject === 'Business Finance') {
        return [
            {question: 'What is the primary goal of financial management?', answers: ['Maximizing sales', 'Maximizing shareholder wealth', 'Minimizing taxes', 'Maximizing employee count'], correctAnswer: 1},
            {question: 'Which of the following is a "Current Asset"?', answers: ['Building', 'Inventory', 'Long-term Investment', 'Machinery'], correctAnswer: 1},
            {question: 'The Time Value of Money principle suggests that:', answers: ['Money today is worth more than money tomorrow', 'Money today is worth less than money tomorrow', 'Money value never changes', 'Interest rates always fall'], correctAnswer: 0},
            {question: 'What does the "Current Ratio" measure?', answers: ['Profitability', 'Liquidity', 'Solvency', 'Efficiency'], correctAnswer: 1},
            {question: 'Which of the following is a source of short-term financing?', answers: ['Corporate Bonds', 'Common Stock', 'Trade Credit', 'Mortgage Loan'], correctAnswer: 2},
            {question: 'What is "Working Capital"?', answers: ['Total Assets', 'Total Liabilities', 'Current Assets minus Current Liabilities', 'Fixed Assets only'], correctAnswer: 2},
            {question: 'The rate of return required by investors is called:', answers: ['Coupon rate', 'Cost of Capital', 'Dividend yield', 'Prime rate'], correctAnswer: 1},
            {question: 'What does "Diversification" in a portfolio aim to do?', answers: ['Increase risk', 'Reduce risk', 'Guarantee profit', 'Eliminate taxes'], correctAnswer: 1},
            {question: 'A "Bond" is essentially a:', answers: ['Share of ownership', 'Gift', 'IOU or Loan', 'Insurance policy'], correctAnswer: 2},
            {question: 'What is the Net Present Value (NPV) if it is positive?', answers: ['The project should be rejected', 'The project should be accepted', 'The project is at break-even', 'The project is losing money'], correctAnswer: 1},
            {question: 'What is "Capital Budgeting"?', answers: ['Daily cash management', 'Planning for long-term investments', 'Setting employee salaries', 'Auditing old records'], correctAnswer: 1},
            {question: 'Which financial ratio uses Net Income divided by Total Assets?', answers: ['Return on Equity', 'Return on Assets', 'Debt Ratio', 'Profit Margin'], correctAnswer: 1},
            {question: 'What is "Financial Leverage"?', answers: ['Using equity to buy assets', 'Using debt to acquire additional assets', 'Selling all assets', 'Increasing prices'], correctAnswer: 1},
            {question: 'The "Initial Public Offering" (IPO) occurs in the:', answers: ['Secondary Market', 'Primary Market', 'Black Market', 'Money Market'], correctAnswer: 1},
            {question: 'What is the "Risk-Free Rate" usually based on?', answers: ['Corporate bonds', 'Stock market average', 'Government Treasury bills', 'Gold prices'], correctAnswer: 2},
            {question: 'A "Dividend" is:', answers: ['A loan repayment', 'A distribution of profits to shareholders', 'A tax penalty', 'A type of bank fee'], correctAnswer: 1},
            {question: 'What is the "Face Value" of a bond?', answers: ['The market price', 'The amount paid at maturity', 'The interest rate', 'The broker\'s fee'], correctAnswer: 1},
            {question: 'What does the "Debt-to-Equity" ratio indicate?', answers: ['Liquidity', 'Financial Leverage', 'Inventory turnover', 'Employee productivity'], correctAnswer: 1},
            {question: '"Compound Interest" is interest calculated on:', answers: ['Principal only', 'Principal and accumulated interest', 'Interest only', 'Future inflation'], correctAnswer: 1},
            {question: 'What is the main advantage of "Common Stock"?', answers: ['Guaranteed dividends', 'Fixed interest', 'Potential for high capital gains', 'Priority in liquidation'], correctAnswer: 2}
        ];
    }
    // ABM - Organization and Management
    if (strand === 'ABM' && subject === 'Organization and Management') {
        return [
            {question: 'Who is known as the "Father of Scientific Management"?', answers: ['Henry Fayol', 'Frederick Taylor', 'Max Weber', 'Peter Drucker'], correctAnswer: 1},
            {question: 'What are the four primary functions of management?', answers: ['Planning, Organizing, Leading, Controlling', 'Buying, Selling, Accounting, Trading', 'Staffing, Budgeting, Reporting, Filing', 'Hiring, Training, Firing, Promoting'], correctAnswer: 0},
            {question: 'Which management level is responsible for strategic, long-term decisions?', answers: ['Lower Management', 'Middle Management', 'Top Management', 'Supervisors'], correctAnswer: 2},
            {question: 'What does "SWOT Analysis" stand for?', answers: ['Sales, Work, Operations, Tasks', 'Strengths, Weaknesses, Opportunities, Threats', 'Staff, Wages, Output, Time', 'Style, Wisdom, Order, Trust'], correctAnswer: 1},
            {question: 'What is "Delegation"?', answers: ['Doing all the work yourself', 'Assigning authority to others', 'Hiring new staff', 'Firing employees'], correctAnswer: 1},
            {question: 'The "Chain of Command" refers to:', answers: ['The production line', 'The line of authority in an organization', 'The supply chain', 'Customer service steps'], correctAnswer: 1},
            {question: 'A "Flat Organization" has:', answers: ['Many levels of management', 'Few or no levels of management', 'A circular building', 'Only one employee'], correctAnswer: 1},
            {question: 'What is "Maslow\'s Hierarchy of Needs" used to understand?', answers: ['Accounting flows', 'Employee motivation', 'Legal requirements', 'Product pricing'], correctAnswer: 1},
            {question: 'The "Bureaucratic Management" theory was developed by:', answers: ['Frederick Taylor', 'Max Weber', 'Douglas McGregor', 'Henry Ford'], correctAnswer: 1},
            {question: 'What is "Organizational Culture"?', answers: ['The country where the business is', 'Shared values and beliefs within a company', 'The dress code only', 'The company\'s tax bracket'], correctAnswer: 1},
            {question: 'What is the purpose of "Planning"?', answers: ['To look at past mistakes only', 'To set goals and decide how to achieve them', 'To organize the office furniture', 'To record daily expenses'], correctAnswer: 1},
            {question: 'Which leadership style involves the leader making all decisions?', answers: ['Democratic', 'Laissez-faire', 'Autocratic', 'Participative'], correctAnswer: 2},
            {question: '"Span of Control" refers to:', answers: ['The length of the workday', 'The number of subordinates a manager supervises', 'The geographic reach of a company', 'The power of the CEO'], correctAnswer: 1},
            {question: 'What is "Human Resource Management" primarily concerned with?', answers: ['Machine maintenance', 'Managing people within the organization', 'Financial auditing', 'Information technology'], correctAnswer: 1},
            {question: 'What is a "Mission Statement"?', answers: ['A list of company debts', 'A summary of why a company exists', 'A prediction of next year\'s profit', 'A map of the office'], correctAnswer: 1},
            {question: 'In "Theory X and Theory Y", Theory Y assumes workers are:', answers: ['Lazy and dislike work', 'Self-motivated and enjoy work', 'Overpaid', 'Unskilled'], correctAnswer: 1},
            {question: 'What is "Total Quality Management" (TQM)?', answers: ['A focus on high prices', 'A continuous effort to improve products and processes', 'An accounting method', 'A hiring strategy'], correctAnswer: 1},
            {question: '"Centralization" means decision-making authority is:', answers: ['Spread among all employees', 'Concentrated at the top level', 'Given to customers', 'Eliminated'], correctAnswer: 1},
            {question: 'The "Control" function of management involves:', answers: ['Ordering people around', 'Monitoring performance and making corrections', 'Hiring new staff', 'Designing logos'], correctAnswer: 1},
            {question: 'What is a "Matrix Structure"?', answers: ['A structure with two reporting lines', 'A structure with no boss', 'A structure used only by tech companies', 'A circular organization'], correctAnswer: 0}
        ];
    }
    // ABM - Business Marketing
    if (strand === 'ABM' && subject === 'Business Marketing') {
        return [
            {question: 'What are the "4 Ps" of the Marketing Mix?', answers: ['People, Process, Profit, Plan', 'Product, Price, Place, Promotion', 'Power, Position, Price, Production', 'Policy, Price, Performance, Promotion'], correctAnswer: 1},
            {question: 'Which concept focuses on identifying the needs of a specific target market?', answers: ['Production Concept', 'Marketing Concept', 'Selling Concept', 'Product Concept'], correctAnswer: 1},
            {question: 'What is "Market Segmentation"?', answers: ['Selling to everyone at once', 'Dividing a market into distinct groups of buyers', 'Lowering prices for a sale', 'Building a new store'], correctAnswer: 1},
            {question: 'A "Brand" is best described as:', answers: ['A name or symbol that identifies a seller\'s product', 'The price of a product', 'The physical packaging only', 'A television advertisement'], correctAnswer: 0},
            {question: 'What is "Target Marketing"?', answers: ['Advertising to the whole country', 'Focusing efforts on a specific segment of customers', 'Setting high sales targets', 'Buying more inventory'], correctAnswer: 1},
            {question: 'Which of the following is a "Demographic" factor?', answers: ['Lifestyle', 'Personality', 'Age', 'Social Class'], correctAnswer: 2},
            {question: 'What does "Niche Marketing" involve?', answers: ['Mass producing products', 'Targeting a small, well-defined market segment', 'Global expansion', 'Ignoring customer feedback'], correctAnswer: 1},
            {question: 'What is "Product Positioning"?', answers: ['Where the product sits on a shelf', 'How a product is perceived by consumers relative to competitors', 'The delivery route', 'The manufacturing process'], correctAnswer: 1},
            {question: 'The "Product Life Cycle" stages are:', answers: ['Birth, Growth, Death', 'Introduction, Growth, Maturity, Decline', 'Planning, Making, Selling', 'Idea, Test, Launch'], correctAnswer: 1},
            {question: 'What is "Relationship Marketing" focused on?', answers: ['One-time sales', 'Long-term customer loyalty', 'Television commercials', 'Lowering production costs'], correctAnswer: 1},
            {question: 'Which of the following is an example of "Promotion"?', answers: ['Setting a price', 'Designing a logo', 'A social media advertisement', 'Opening a new warehouse'], correctAnswer: 2},
            {question: 'What is "Market Research"?', answers: ['Spying on people', 'Systematic collection and analysis of data about a market', 'Hiring new sales staff', 'Creating a budget'], correctAnswer: 1},
            {question: 'A "Loss Leader" is a product that is:', answers: ['Very expensive', 'Sold at or below cost to attract customers', 'Discontinued', 'The most popular item'], correctAnswer: 1},
            {question: 'What is "B2B Marketing"?', answers: ['Business to Baby', 'Business to Business', 'Back to Business', 'Buyer to Buyer'], correctAnswer: 1},
            {question: 'Which "P" of the marketing mix involves distribution channels?', answers: ['Product', 'Price', 'Place', 'Promotion'], correctAnswer: 2},
            {question: 'What is "Brand Equity"?', answers: ['The physical value of the factory', 'The value premium a brand name provides to a product', 'The number of stores a brand has', 'The CEO\'s salary'], correctAnswer: 1},
            {question: 'A "Focus Group" is used to:', answers: ['Train employees', 'Gather qualitative feedback from consumers', 'Calculate taxes', 'Organize files'], correctAnswer: 1},
            {question: 'What is "Skimming Pricing"?', answers: ['Setting a very low price', 'Setting a high price initially then lowering it', 'Stealing prices from competitors', 'Pricing based on weight'], correctAnswer: 1},
            {question: 'Which of the following is an "Intangible" product?', answers: ['Smartphone', 'Car', 'Haircut', 'Bottle of water'], correctAnswer: 2},
            {question: 'What is the "Unique Selling Proposition" (USP)?', answers: ['The total cost of production', 'The factor that makes a product different from its competitors', 'The legal name of a company', 'The shipping speed'], correctAnswer: 1}
        ];
    }
    // ABM - Business Ethics
    if (strand === 'ABM' && subject === 'Business Ethics') {
        return [
            {question: 'What is "Corporate Social Responsibility" (CSR)?', answers: ['Maximizing profit at any cost', 'A company\'s obligation to act for the benefit of society', 'Paying employees minimum wage', 'Following only the laws'], correctAnswer: 1},
            {question: 'A "Conflict of Interest" occurs when:', answers: ['Employees work overtime', 'Personal interests interfere with professional duties', 'Two managers disagree', 'Prices are too high'], correctAnswer: 1},
            {question: 'What is "Whistleblowing"?', answers: ['A referee in a game', 'Reporting illegal or unethical behavior within an organization', 'Advertising a new product', 'Quitting a job'], correctAnswer: 1},
            {question: 'Which of the following is an "Ethical Dilemma"?', answers: ['Choosing a color for a logo', 'Deciding whether to report a friend for stealing', 'Calculating a balance sheet', 'Hiring a qualified candidate'], correctAnswer: 1},
            {question: 'What does "Transparency" in business mean?', answers: ['Using glass windows in offices', 'Operating in an open and honest way', 'Hiding financial records', 'Having a secret plan'], correctAnswer: 1},
            {question: 'A "Code of Ethics" is:', answers: ['A secret password', 'A formal document outlining a company\'s values and standards', 'A government law', 'An employee contract'], correctAnswer: 1},
            {question: 'What is "Insider Trading"?', answers: ['Trading products inside a store', 'Using non-public information to trade stocks for profit', 'Selling goods to other countries', 'Buying supplies from a vendor'], correctAnswer: 1},
            {question: 'What is "Sustainability" in business?', answers: ['Making a profit for one year', 'Meeting present needs without compromising future generations', 'Opening more stores', 'Reducing the workforce'], correctAnswer: 1},
            {question: 'Which of the following is an example of "Unethical Marketing"?', answers: ['Giving a discount', 'Making false or misleading claims about a product', 'Using a catchy song', 'Advertising on TV'], correctAnswer: 1},
            {question: 'What are "Stakeholders"?', answers: ['Only the owners of the company', 'Anyone affected by the company\'s actions', 'The people who build the office', 'Competitors only'], correctAnswer: 1},
            {question: 'What is "Fair Trade"?', answers: ['Trading items of equal weight', 'Ensuring producers in developing countries get a fair price', 'Selling goods at the highest possible price', 'Ignoring labor laws'], correctAnswer: 1},
            {question: '"Utilitarianism" suggests that an action is ethical if it:', answers: ['Benefits only the leader', 'Produces the greatest good for the greatest number', 'Is legal', 'Is profitable'], correctAnswer: 1},
            {question: 'What is "Bribery"?', answers: ['Giving a gift to a friend', 'Offering money or favors to influence an official', 'Paying a bill on time', 'Getting a promotion'], correctAnswer: 1},
            {question: 'Why is "Workplace Diversity" considered ethical?', answers: ['It makes the office look good', 'It ensures equal opportunity and fair treatment for all', 'It reduces the salary budget', 'It is required by all religions'], correctAnswer: 1},
            {question: 'What is "Discrimination" in the workplace?', answers: ['Promoting the best worker', 'Unfair treatment based on race, gender, or age', 'Hiring a specialist', 'Setting high standards'], correctAnswer: 1},
            {question: 'The term "Fiduciary Duty" refers to the obligation to:', answers: ['Act in the best interest of another party', 'Pay taxes on time', 'Sell products globally', 'Hire family members'], correctAnswer: 0},
            {question: 'What is a "Phishing" scam?', answers: ['Going fishing at work', 'Fraudulent attempts to obtain sensitive information', 'A type of marketing email', 'A product defect'], correctAnswer: 1},
            {question: 'What is "Consumer Privacy" concerned with?', answers: ['How much a customer spends', 'The protection of customer data and information', 'Where a customer lives', 'The customer\'s favorite color'], correctAnswer: 1},
            {question: 'The "Triple Bottom Line" measures performance in terms of:', answers: ['Profit, Profit, Profit', 'People, Planet, Profit', 'Sales, Expenses, Taxes', 'Local, National, Global'], correctAnswer: 1},
            {question: 'What is "Integrity"?', answers: ['Being the most skilled at a job', 'Consistently adhering to strong moral and ethical principles', 'Working the longest hours', 'Making the most money'], correctAnswer: 1}
        ];
    }
    // HUMSS - Creative Writing
    if (strand === 'HUMSS' && subject === 'Creative Writing') {
        return [
            {question: 'What is the climax in a story?', answers: ['Beginning', 'Rising action', 'Highest point of tension', 'Resolution'], correctAnswer: 2},
            {question: 'What is a protagonist?', answers: ['Main character', 'Villain', 'Supporting character', 'Narrator'], correctAnswer: 0},
            {question: 'What is a metaphor?', answers: ['Direct comparison', 'Comparison using like/as', 'Exaggeration', 'Sound imitation'], correctAnswer: 0},
            {question: 'What is a simile?', answers: ['Direct comparison', 'Comparison using like/as', 'Exaggeration', 'Opposite meaning'], correctAnswer: 1},
            {question: 'What is point of view?', answers: ['Plot perspective', 'Narrative perspective', 'Character opinion', 'Setting description'], correctAnswer: 1},
            {question: 'What is foreshadowing?', answers: ['Past events', 'Hints about future events', 'Character description', 'Setting details'], correctAnswer: 1},
            {question: 'What is imagery?', answers: ['Plot description', 'Vivid sensory description', 'Character dialogue', 'Story theme'], correctAnswer: 1},
            {question: 'What is alliteration?', answers: ['Repetition of consonant sounds', 'Repetition of vowel sounds', 'Rhyming words', 'Opposite meanings'], correctAnswer: 0},
            {question: 'What is personification?', answers: ['Human comparison', 'Giving human traits to non-human', 'Animal description', 'Object naming'], correctAnswer: 1},
            {question: 'What is onomatopoeia?', answers: ['Rhyming', 'Sound words', 'Repeated phrases', 'Story structure'], correctAnswer: 1},
            {question: 'What is theme?', answers: ['Main character', 'Central message', 'Story setting', 'Plot twist'], correctAnswer: 1},
            {question: 'What is tone?', answers: ['Story length', 'Author\'s attitude', 'Character emotion', 'Plot speed'], correctAnswer: 1},
            {question: 'What is conflict?', answers: ['Story beginning', 'Problem/struggle', 'Happy ending', 'Character trait'], correctAnswer: 1},
            {question: 'What is resolution?', answers: ['Story beginning', 'Problem solved', 'Character introduced', 'Setting described'], correctAnswer: 1},
            {question: 'What is dialogue?', answers: ['Character thoughts', 'Character conversation', 'Story narration', 'Setting description'], correctAnswer: 1},
            {question: 'What is hyperbole?', answers: ['Understatement', 'Exaggeration', 'Comparison', 'Contradiction'], correctAnswer: 1},
            {question: 'What is irony?', answers: ['Expected outcome', 'Unexpected outcome', 'Happy ending', 'Sad ending'], correctAnswer: 1},
            {question: 'What is setting?', answers: ['Time and place', 'Character name', 'Story theme', 'Plot point'], correctAnswer: 0},
            {question: 'What is symbolism?', answers: ['Literal meaning', 'Deeper meaning through symbols', 'Character name', 'Story title'], correctAnswer: 1},
            {question: 'What is flashback?', answers: ['Future events', 'Past events shown', 'Present moment', 'Story ending'], correctAnswer: 1}
        ];
    }
    // HUMSS - Disciplines and Ideas
    if (strand === 'HUMSS' && subject === 'Disciplines and Ideas') {
        return [
            {question: 'Which social science discipline studies the production, distribution, and consumption of goods?', answers: ['Sociology', 'Economics', 'Anthropology', 'Psychology'], correctAnswer: 1},
            {question: 'What is the primary focus of Anthropology?', answers: ['The human mind', 'Past and present human societies and cultures', 'Political systems', 'Market trends'], correctAnswer: 1},
            {question: 'Which theory focuses on the symbolic meanings people develop through social interaction?', answers: ['Structural Functionalism', 'Marxism', 'Symbolic Interactionism', 'Psychoanalysis'], correctAnswer: 2},
            {question: 'Who is considered the "Father of Psychoanalysis"?', answers: ['Karl Marx', 'Emile Durkheim', 'Sigmund Freud', 'Max Weber'], correctAnswer: 2},
            {question: 'Which discipline focuses on the study of the mind and individual behavior?', answers: ['History', 'Geography', 'Psychology', 'Political Science'], correctAnswer: 2},
            {question: 'Structural Functionalism views society as a system of:', answers: ['Constant conflict', 'Interconnected parts working for stability', 'Symbolic gestures', 'Individual choices'], correctAnswer: 1},
            {question: 'What is the focus of Marxism?', answers: ['Class struggle and social inequality', 'Biological evolution', 'Spatial distribution', 'Mental health'], correctAnswer: 0},
            {question: 'Which social science deals with the study of the earth’s physical features and atmosphere?', answers: ['Demography', 'Geography', 'Linguistics', 'Economics'], correctAnswer: 1},
            {question: 'What is the study of language and its structure called?', answers: ['Literature', 'Sociology', 'Linguistics', 'Philosophy'], correctAnswer: 2},
            {question: 'Which discipline studies human populations and their characteristics?', answers: ['Demography', 'Anthropology', 'Political Science', 'History'], correctAnswer: 0},
            {question: 'Who wrote the "Communist Manifesto"?', answers: ['Adam Smith', 'Karl Marx', 'Auguste Comte', 'Herbert Spencer'], correctAnswer: 1},
            {question: 'What is "Rational Choice Theory" primarily based on?', answers: ['Emotional impulses', 'Social traditions', 'Individuals making logical decisions for personal gain', 'Religious doctrines'], correctAnswer: 2},
            {question: 'The "Id, Ego, and Superego" are concepts in which field?', answers: ['Sociology', 'Economics', 'Psychology', 'Geography'], correctAnswer: 2},
            {question: 'Which discipline studies the past through the examination of written records?', answers: ['Archaeology', 'History', 'Anthropology', 'Sociology'], correctAnswer: 1},
            {question: 'What is "Feminist Theory" primarily concerned with?', answers: ['Gender equality and women\'s rights', 'Market competition', 'Geological shifts', 'Mathematical logic'], correctAnswer: 0},
            {question: 'Who coined the term "Sociology"?', answers: ['Karl Marx', 'Auguste Comte', 'Max Weber', 'Talcot Parsons'], correctAnswer: 1},
            {question: 'Which perspective sees society as a competition for limited resources?', answers: ['Conflict Theory', 'Functionalism', 'Institutionalism', 'Hermeneutics'], correctAnswer: 0},
            {question: 'The study of political power and government systems is:', answers: ['Economics', 'Psychology', 'Political Science', 'Demography'], correctAnswer: 2},
            {question: 'Which social science uses "participant observation" as a key research method?', answers: ['Economics', 'Anthropology', 'Statistics', 'Demography'], correctAnswer: 1},
            {question: 'What is the primary concern of "Human-Environment Systems" studies?', answers: ['Pure biology', 'The interaction between human society and the environment', 'Space exploration', 'Psychological disorders'], correctAnswer: 1}
        ];
    }
    // HUMSS - Trends and Issues
    if (strand === 'HUMSS' && subject === 'Trends and Issues') {
        return [
            {question: 'What is the difference between a fad and a trend?', answers: ['Fads last longer', 'Trends have a long-term impact on society', 'Fads are based on logic', 'There is no difference'], correctAnswer: 1},
            {question: 'What is "Global Warming" an example of?', answers: ['A local fad', 'A planetary trend', 'A short-term issue', 'A social network'], correctAnswer: 1},
            {question: 'What does "Globalization" refer to?', answers: ['Isolation of countries', 'Increasing interconnectedness of nations', 'Destruction of global trade', 'Local farming only'], correctAnswer: 1},
            {question: 'Which of the following is a key element of a "Network"?', answers: ['Solitude', 'Interconnections or nodes', 'A single point', 'Chaos'], correctAnswer: 1},
            {question: 'What is "Critical Thinking"?', answers: ['Accepting information without question', 'Analyzing and evaluating information objectively', 'Negative complaining', 'Memorizing facts'], correctAnswer: 1},
            {question: 'The process of moving from one country to another is called:', answers: ['Urbanization', 'Migration', 'Globalism', 'Networking'], correctAnswer: 1},
            {question: 'What is a "Mega-trend"?', answers: ['A trend that lasts a week', 'A large-scale, long-term shift in global direction', 'A popular song', 'A local election'], correctAnswer: 1},
            {question: 'What is "Citizen Journalism"?', answers: ['Professional news reporting', 'Public citizens playing an active role in reporting news', 'A government newspaper', 'Journalism for animals'], correctAnswer: 1},
            {question: 'Which of the following is an example of an "ICT" trend?', answers: ['Manual typewriters', 'Cloud computing', 'Pony Express', 'Oral tradition'], correctAnswer: 1},
            {question: 'What is "Strategic Analysis"?', answers: ['Guessing the future', 'Deliberate planning to achieve a goal', 'Spontaneous reaction', 'Following the crowd'], correctAnswer: 1},
            {question: 'What does "Sustainable Development" mean?', answers: ['Rapid industrialization', 'Development that meets current needs without compromising the future', 'Using all resources now', 'Stopping all growth'], correctAnswer: 1},
            {question: 'A network of people who share common interests is a:', answers: ['Social Network', 'Biological Network', 'Mechanical Network', 'Closed Circuit'], correctAnswer: 0},
            {question: 'What is "Intuitive Thinking"?', answers: ['Mathematical calculation', 'Quick, instinctive understanding without conscious reasoning', 'Slow, step-by-step logic', 'Data analysis'], correctAnswer: 1},
            {question: 'Which of these is a challenge of globalization?', answers: ['Increased trade', 'Loss of local cultural identity', 'Global communication', 'Cheaper travel'], correctAnswer: 1},
            {question: 'What is "Democracy" in the context of social trends?', answers: ['Rule by a king', 'Power vested in the people', 'Military rule', 'One-party system'], correctAnswer: 1},
            {question: 'What is "Collaboration" in a 21st-century context?', answers: ['Working alone', 'Working together to achieve a common goal', 'Competing with peers', 'Ignoring others'], correctAnswer: 1},
            {question: 'The "Digital Divide" refers to:', answers: ['A math problem', 'The gap between those with and without access to technology', 'A broken computer', 'Social media followers'], correctAnswer: 1},
            {question: 'What is "Innovation"?', answers: ['Doing things the same way', 'Creating new ideas or methods', 'Copying others', 'Returning to the past'], correctAnswer: 1},
            {question: 'Which trend focuses on the protection of the natural world?', answers: ['Consumerism', 'Environmentalism', 'Materialism', 'Industrialism'], correctAnswer: 1},
            {question: 'What is the goal of "Media Literacy"?', answers: ['To buy more gadgets', 'To understand and analyze media messages', 'To become a TV star', 'To avoid the news'], correctAnswer: 1}
        ];
    }
    // HUMSS - Philippine Politics
    if (strand === 'HUMSS' && subject === 'Philippine Politics') {
        return [
            {question: 'What is the highest law of the land in the Philippines?', answers: ['Civil Code', 'Penal Code', '1987 Constitution', 'Local Government Code'], correctAnswer: 2},
            {question: 'Which branch of government makes the laws?', answers: ['Executive', 'Legislative', 'Judicial', 'Military'], correctAnswer: 1},
            {question: 'Who is the Commander-in-Chief of the Armed Forces of the Philippines?', answers: ['Chief of Staff', 'President', 'Senate President', 'Secretary of Defense'], correctAnswer: 1},
            {question: 'How many senators are in the Philippine Senate?', answers: ['12', '24', '50', '100'], correctAnswer: 1},
            {question: 'Which branch of government interprets the laws?', answers: ['Executive', 'Legislative', 'Judicial', 'Administrative'], correctAnswer: 2},
            {question: 'What is the term of office for a Philippine President?', answers: ['4 years', '6 years', 'Permanent', '8 years'], correctAnswer: 1},
            {question: 'What is the minimum age to run for President in the Philippines?', answers: ['30', '35', '40', '45'], correctAnswer: 2},
            {question: 'Which power allows the President to reject a bill passed by Congress?', answers: ['Veto Power', 'Pardon Power', 'Police Power', 'Taxing Power'], correctAnswer: 0},
            {question: 'What are the two houses of the Philippine Congress?', answers: ['Senate and House of Representatives', 'Upper and Lower Judiciary', 'Cabinet and Local Government', 'City and Provincial Council'], correctAnswer: 0},
            {question: 'The Supreme Court is composed of how many Justices (including the Chief Justice)?', answers: ['10', '12', '15', '20'], correctAnswer: 2},
            {question: 'What is "Suffrage"?', answers: ['Pain and suffering', 'The right to vote', 'The right to travel', 'Freedom of speech'], correctAnswer: 1},
            {question: 'Which commission manages elections in the Philippines?', answers: ['COA', 'CSC', 'COMELEC', 'CHR'], correctAnswer: 2},
            {question: 'What is the "Bill of Rights"?', answers: ['A list of taxes', 'Declaration of basic rights and protections of citizens', 'A list of laws for businesses', 'A collection of court fees'], correctAnswer: 1},
            {question: 'The local government unit led by a Governor is the:', answers: ['City', 'Municipality', 'Province', 'Barangay'], correctAnswer: 2},
            {question: 'What is the smallest administrative division in the Philippines?', answers: ['Purok', 'Town', 'Barangay', 'District'], correctAnswer: 2},
            {question: 'What does "Check and Balance" mean in government?', answers: ['Counting the money', 'Branches of government limiting each others powers', 'Paying the bills', 'Balancing the budget'], correctAnswer: 1},
            {question: 'Which official takes over if the President dies or is removed?', answers: ['Speaker of the House', 'Vice President', 'Chief Justice', 'Senate President'], correctAnswer: 1},
            {question: 'What is "Separation of Powers"?', answers: ['Dividing the country into regions', 'Dividing government authority into three branches', 'Leaving the government', 'Cutting off communication'], correctAnswer: 1},
            {question: 'How long is the term for local officials (Mayors, Governors)?', answers: ['3 years', '6 years', '4 years', '5 years'], correctAnswer: 0},
            {question: 'What is the main function of the Judiciary?', answers: ['Implementing laws', 'Enforcing laws', 'Settling legal controversies and interpreting laws', 'Creating laws'], correctAnswer: 2}
        ];
    }
    // HUMSS - Community Engagement
    if (strand === 'HUMSS' && subject === 'Community Engagement') {
        return [
            {question: 'What is the primary goal of Community Engagement?', answers: ['Profit', 'Building partnerships for social change', 'Isolation', 'Competition'], correctAnswer: 1},
            {question: 'What is "Social Solidarity"?', answers: ['Being alone', 'Unity and sense of belonging in a group', 'Conflict between neighbors', 'Leaving the community'], correctAnswer: 1},
            {question: 'Which of the following is an example of "Volunteerism"?', answers: ['Working for a salary', 'Helping a local shelter without pay', 'Paying taxes', 'Buying groceries'], correctAnswer: 1},
            {question: 'What is "Civil Society"?', answers: ['Government officials only', 'Non-government organizations and citizen groups', 'The military', 'A private corporation'], correctAnswer: 1},
            {question: 'What does "Citizenship" imply?', answers: ['Just living in a place', 'Rights and responsibilities in a state', 'Having a passport only', 'Following no rules'], correctAnswer: 1},
            {question: 'What is a "Community Action Plan"?', answers: ['A map of a park', 'A strategy for community improvement', 'A personal diary', 'A shopping list'], correctAnswer: 1},
            {question: 'What is "Empowerment" in a community context?', answers: ['Giving people more money', 'Giving people the tools to control their own lives', 'Taking over the government', 'Relying on others'], correctAnswer: 1},
            {question: 'Which of these is a "Grassroots" movement?', answers: ['Government-led initiative', 'Action started by ordinary people in a local community', 'International corporate plan', 'Military operation'], correctAnswer: 1},
            {question: 'What is "Social Advocacy"?', answers: ['Ignoring problems', 'Speaking up for a cause or marginalized group', 'Making personal profit', 'Quietly following orders'], correctAnswer: 1},
            {question: 'What is "Public Interest"?', answers: ['The welfare of the general public', 'Private business gains', 'A hobby', 'Bank interest rates'], correctAnswer: 0},
            {question: 'What is the role of a "Community Leader"?', answers: ['To dictate orders', 'To facilitate and inspire collective action', 'To collect money', 'To work alone'], correctAnswer: 1},
            {question: 'What is "Sustainable Living"?', answers: ['Wasting resources', 'Lifestyle that reduces use of Earth\'s natural resources', 'Buying everything new', 'Living in a factory'], correctAnswer: 1},
            {question: 'What is a "Stakeholder" in community engagement?', answers: ['Only the donors', 'Anyone with an interest in or affected by the project', 'The construction workers', 'People from other countries'], correctAnswer: 1},
            {question: 'What is "Inclusivity"?', answers: ['Leaving people out', 'Ensuring everyone has equal access and opportunity', 'Targeting only the rich', 'Working in secret'], correctAnswer: 1},
            {question: 'What is "Social Justice"?', answers: ['Punishing people', 'Fair and equitable distribution of wealth and opportunities', 'Winning a court case', 'Ignoring inequality'], correctAnswer: 1},
            {question: 'What is "Human Rights"?', answers: ['Rights for citizens only', 'Universal rights inherent to all human beings', 'Rights given by employers', 'Rights for adults only'], correctAnswer: 1},
            {question: 'What is "Community Mapping"?', answers: ['Identifying community assets and needs', 'Drawing a picture of a house', 'Using GPS to find a store', 'Planning a vacation'], correctAnswer: 0},
            {question: 'What is "Dialogue" in community building?', answers: ['A one-way speech', 'Open and honest communication between parties', 'A written command', 'A silent protest'], correctAnswer: 1},
            {question: 'What is the "Common Good"?', answers: ['Personal wealth', 'The benefit of all members of a community', 'Government property', 'Cheaper goods'], correctAnswer: 1},
            {question: 'What is "Philanthropy"?', answers: ['Selling products', 'The desire to promote the welfare of others, expressed by donating money', 'Buying expensive art', 'Studying philosophy'], correctAnswer: 1}
        ];
    }
    // HUMSS - World Religions
    if (strand === 'HUMSS' && subject === 'World Religions') {
        return [
            {question: 'What is the sacred text of Islam?', answers: ['Bible', 'Torah', 'Quran', 'Vedas'], correctAnswer: 2},
            {question: 'Who is the founder of Buddhism?', answers: ['Jesus Christ', 'Siddhartha Gautama', 'Abraham', 'Muhammad'], correctAnswer: 1},
            {question: 'Which religion believes in the Holy Trinity?', answers: ['Judaism', 'Islam', 'Christianity', 'Hinduism'], correctAnswer: 2},
            {question: 'What is the oldest major world religion?', answers: ['Hinduism', 'Christianity', 'Islam', 'Sikhism'], correctAnswer: 0},
            {question: 'What is "Monotheism"?', answers: ['Belief in many gods', 'Belief in only one God', 'Belief in no god', 'Belief in nature spirits'], correctAnswer: 1},
            {question: 'Which religion follows the "Eightfold Path"?', answers: ['Judaism', 'Buddhism', 'Shinto', 'Taoism'], correctAnswer: 1},
            {question: 'What is the sacred text of Judaism?', answers: ['Quran', 'Torah', 'Tripitaka', 'Gospels'], correctAnswer: 1},
            {question: 'What is "Karma" in Hinduism and Buddhism?', answers: ['Good luck', 'Action and subsequent reaction/consequence', 'A religious song', 'A type of food'], correctAnswer: 1},
            {question: 'The place of worship for Muslims is called a:', answers: ['Church', 'Mosque', 'Temple', 'Synagogue'], correctAnswer: 1},
            {question: 'What is the central theme of Taoism?', answers: ['Strict laws', 'Living in harmony with the "Way" or nature', 'Wealth accumulation', 'Military conquest'], correctAnswer: 1},
            {question: 'Which religion originated in the Punjab region of India?', answers: ['Buddhism', 'Sikhism', 'Shinto', 'Jainism'], correctAnswer: 1},
            {question: 'What is "Nirvana" in Buddhism?', answers: ['A state of perfect peace and liberation', 'A physical heaven', 'Rebirth as a king', 'A ritual dance'], correctAnswer: 0},
            {question: 'Which religion considers the Ganges River sacred?', answers: ['Islam', 'Hinduism', 'Christianity', 'Judaism'], correctAnswer: 1},
            {question: 'Who is considered the patriarch of Judaism, Christianity, and Islam?', answers: ['Moses', 'Abraham', 'David', 'Noah'], correctAnswer: 1},
            {question: 'What is "Polytheism"?', answers: ['Belief in one god', 'Belief in multiple gods', 'Belief in the universe', 'No belief'], correctAnswer: 1},
            {question: 'What is the primary symbol of Christianity?', answers: ['Star of David', 'Crescent and Star', 'Cross', 'Dharma Wheel'], correctAnswer: 2},
            {question: 'Which religion is indigenous to Japan?', answers: ['Hinduism', 'Shinto', 'Taoism', 'Buddhism'], correctAnswer: 1},
            {question: 'What does "Atheism" mean?', answers: ['Belief in one god', 'Disbelief or lack of belief in any gods', 'Belief in ghosts', 'Belief in nature'], correctAnswer: 1},
            {question: 'What is the "Dharma" in Hinduism?', answers: ['Sin', 'Duty, religion, or moral order', 'Wealth', 'Physical exercise'], correctAnswer: 1},
            {question: 'The "Five Pillars" are the core practices of which religion?', answers: ['Buddhism', 'Judaism', 'Islam', 'Hinduism'], correctAnswer: 2}
        ];
    }
    // CSS - CSS Fundamentals
    if (strand === 'CSS' && subject === 'CSS Fundamentals') {
        return [
            {question: 'What does CSS stand for?', answers: ['Computer Style Sheets', 'Cascading Style Sheets', 'Creative Style System', 'Coded Style Sheets'], correctAnswer: 1},
            {question: 'Which property changes text color?', answers: ['font-color', 'text-color', 'color', 'foreground'], correctAnswer: 2},
            {question: 'Which property changes background color?', answers: ['background-color', 'bg-color', 'color-bg', 'back-color'], correctAnswer: 0},
            {question: 'What symbol is used for class selector?', answers: ['#', '.', '*', '@'], correctAnswer: 1},
            {question: 'What symbol is used for ID selector?', answers: ['#', '.', '*', '@'], correctAnswer: 0},
            {question: 'Which property controls text size?', answers: ['text-size', 'font-size', 'size', 'text-style'], correctAnswer: 1},
            {question: 'What does padding control?', answers: ['Outside spacing', 'Inside spacing', 'Border width', 'Text alignment'], correctAnswer: 1},
            {question: 'What does margin control?', answers: ['Outside spacing', 'Inside spacing', 'Border width', 'Text alignment'], correctAnswer: 0},
            {question: 'Which property makes text bold?', answers: ['font-style', 'font-weight', 'text-bold', 'font-bold'], correctAnswer: 1},
            {question: 'Which value centers text?', answers: ['text-align: middle', 'text-align: center', 'align: center', 'text: center'], correctAnswer: 1},
            {question: 'What is the default display value of <div>?', answers: ['inline', 'block', 'flex', 'grid'], correctAnswer: 1},
            {question: 'What property creates rounded corners?', answers: ['corner-radius', 'border-radius', 'round-corner', 'radius'], correctAnswer: 1},
            {question: 'Which property controls element opacity?', answers: ['transparency', 'opacity', 'visibility', 'alpha'], correctAnswer: 1},
            {question: 'What does z-index control?', answers: ['Width', 'Height', 'Stacking order', 'Rotation'], correctAnswer: 2},
            {question: 'Which property hides an element?', answers: ['display: none', 'visible: false', 'show: none', 'hide: true'], correctAnswer: 0},
            {question: 'What is flexbox used for?', answers: ['Text styling', 'Layout design', 'Color schemes', 'Animations'], correctAnswer: 1},
            {question: 'Which property adds shadow to text?', answers: ['shadow', 'text-shadow', 'font-shadow', 'shadow-text'], correctAnswer: 1},
            {question: 'What does position: relative do?', answers: ['Removes from flow', 'Positions relative to normal position', 'Fixes to viewport', 'Centers element'], correctAnswer: 1},
            {question: 'Which property controls line height?', answers: ['line-height', 'text-height', 'height-line', 'spacing'], correctAnswer: 0},
            {question: 'What unit is % relative to?', answers: ['Viewport', 'Parent element', 'Root element', 'Browser window'], correctAnswer: 1}
        ];
    }
    // CSS - Computer Hardware
    if (strand === 'CSS' && subject === 'Computer Hardware') {
        return [
            {question: 'What is the main circuit board of a computer called?', answers: ['CPU', 'Motherboard', 'RAM', 'Hard Drive'], correctAnswer: 1},
            {question: 'Which component is known as the "brain" of the computer?', answers: ['GPU', 'RAM', 'CPU', 'PSU'], correctAnswer: 2},
            {question: 'What type of memory is volatile and used for temporary data storage?', answers: ['ROM', 'RAM', 'HDD', 'SSD'], correctAnswer: 1},
            {question: 'What does BIOS stand for?', answers: ['Basic Input Output System', 'Binary Input Operating System', 'Basic Internal Output State', 'Board Integrated Operating System'], correctAnswer: 0},
            {question: 'Which storage device has no moving parts and is faster than a standard HDD?', answers: ['Floppy Disk', 'Optical Drive', 'SSD', 'Magnetic Tape'], correctAnswer: 2},
            {question: 'Which component provides power to all other hardware?', answers: ['Motherboard', 'CPU Fan', 'PSU', 'Voltage Regulator'], correctAnswer: 2},
            {question: 'What is the purpose of a Heat Sink?', answers: ['To store data', 'To dissipate heat from the CPU', 'To increase RAM speed', 'To power the monitor'], correctAnswer: 1},
            {question: 'Which port is commonly used to connect a mouse or keyboard today?', answers: ['VGA', 'Serial Port', 'USB', 'Parallel Port'], correctAnswer: 2},
            {question: 'What does "POST" stand for during computer startup?', answers: ['Power On Self Test', 'Primary Operating System Test', 'Public Output Serial Trace', 'Power On System Timing'], correctAnswer: 0},
            {question: 'Which hardware is responsible for rendering images and video?', answers: ['Sound Card', 'Video Card (GPU)', 'NIC', 'Controller Card'], correctAnswer: 1},
            {question: 'What is the standard size for a desktop motherboard?', answers: ['Micro-SD', 'ATX', 'SATA', 'PCIe'], correctAnswer: 1},
            {question: 'Which cable is used to connect a hard drive to the motherboard?', answers: ['HDMI', 'SATA', 'VGA', 'Ethernet'], correctAnswer: 1},
            {question: 'What type of battery is found on the motherboard to keep the system clock?', answers: ['AA Battery', 'Lithium Ion', 'CMOS Battery', 'Lead Acid'], correctAnswer: 2},
            {question: 'What does DDR stand for in relation to RAM?', answers: ['Data Dual Rate', 'Double Data Rate', 'Digital Data Record', 'Direct Data Run'], correctAnswer: 1},
            {question: 'Which of these is an input device?', answers: ['Monitor', 'Printer', 'Scanner', 'Speaker'], correctAnswer: 2},
            {question: 'What is the capacity of a standard CD-ROM?', answers: ['700 MB', '4.7 GB', '1.44 MB', '25 GB'], correctAnswer: 0},
            {question: 'Which slot on the motherboard is used for high-end graphics cards?', answers: ['PCI', 'AGP', 'PCI Express x16', 'ISA'], correctAnswer: 2},
            {question: 'What happens if you don\'t apply thermal paste to a CPU?', answers: ['Windows won\'t install', 'The CPU will overheat', 'The RAM will fail', 'The monitor will flicker'], correctAnswer: 1},
            {question: 'Which expansion card allows a computer to connect to a network?', answers: ['Sound Card', 'NIC', 'Video Card', 'USB Card'], correctAnswer: 1},
            {question: 'What is the main function of the Northbridge chipset?', answers: ['Managing high-speed communication', 'Managing USB ports', 'Handling audio output', 'Controlling the power button'], correctAnswer: 0}
        ];
    }
    // CSS - Network Configuration
    if (strand === 'CSS' && subject === 'Network Configuration') {
        return [
            {question: 'What does IP stand for?', answers: ['Internal Protocol', 'Internet Protocol', 'Instant Port', 'Interface Program'], correctAnswer: 1},
            {question: 'Which device connects different networks together?', answers: ['Switch', 'Hub', 'Router', 'Repeater'], correctAnswer: 2},
            {question: 'What is the default IP address for most local routers?', answers: ['127.0.0.1', '192.168.1.1', '8.8.8.8', '255.255.255.0'], correctAnswer: 1},
            {question: 'Which protocol is used for sending emails?', answers: ['HTTP', 'FTP', 'SMTP', 'DHCP'], correctAnswer: 2},
            {question: 'What does DHCP do?', answers: ['Encrypts data', 'Automatically assigns IP addresses', 'Resolves domain names', 'Blocks viruses'], correctAnswer: 1},
            {question: 'Which layer of the OSI model is the "Physical Layer"?', answers: ['Layer 1', 'Layer 3', 'Layer 5', 'Layer 7'], correctAnswer: 0},
            {question: 'What is the purpose of a Subnet Mask?', answers: ['To identify the network portion of an IP', 'To hide the IP address', 'To speed up the internet', 'To block websites'], correctAnswer: 0},
            {question: 'Which command is used to test connectivity between two nodes?', answers: ['ipconfig', 'ping', 'netstat', 'tracert'], correctAnswer: 1},
            {question: 'What is the maximum speed of a Category 6 (Cat6) cable?', answers: ['10 Mbps', '100 Mbps', '1 Gbps', '10 Gbps'], correctAnswer: 3},
            {question: 'What does DNS stand for?', answers: ['Data Network System', 'Domain Name System', 'Digital Network Security', 'Direct Node Server'], correctAnswer: 1},
            {question: 'Which topology connects all devices to a single central cable?', answers: ['Star', 'Ring', 'Bus', 'Mesh'], correctAnswer: 2},
            {question: 'What is the bit-size of an IPv4 address?', answers: ['32 bits', '64 bits', '128 bits', '16 bits'], correctAnswer: 0},
            {question: 'Which port number is used by HTTP?', answers: ['21', '80', '443', '53'], correctAnswer: 1},
            {question: 'What is a "Ping of Death"?', answers: ['A hardware failure', 'A type of DoS attack', 'A slow internet connection', 'A router reset'], correctAnswer: 1},
            {question: 'What does a Switch do that a Hub does not?', answers: ['It amplifies signals', 'It sends data only to the specific destination port', 'It connects to the internet', 'It works without power'], correctAnswer: 1},
            {question: 'Which wireless standard is known as Wi-Fi 6?', answers: ['802.11n', '802.11ac', '802.11ax', '802.11g'], correctAnswer: 2},
            {question: 'What is a Firewall used for?', answers: ['Cooling the server', 'Monitoring and controlling incoming/outgoing traffic', 'Increasing storage space', 'Connecting cables'], correctAnswer: 1},
            {question: 'What is the bit-size of an IPv6 address?', answers: ['32 bits', '64 bits', '128 bits', '256 bits'], correctAnswer: 2},
            {question: 'Which protocol is used for secure web browsing?', answers: ['HTTP', 'HTTPS', 'FTP', 'Telnet'], correctAnswer: 1},
            {question: 'What is a LAN?', answers: ['Large Area Network', 'Local Area Network', 'Link Access Node', 'Long Antenna Network'], correctAnswer: 1}
        ];
    }
    // CSS - Contact Center
    if (strand === 'CSS' && subject === 'Contact Center') {
        return [
            {question: 'What does CRM stand for in a contact center?', answers: ['Customer Relation Mode', 'Customer Relationship Management', 'Call Recording Method', 'Core Resource Monitoring'], correctAnswer: 1},
            {question: 'What is "AHT"?', answers: ['Average Handling Time', 'Always Help Today', 'Automated Help Tool', 'Account History Track'], correctAnswer: 0},
            {question: 'What is the primary goal of an outbound call center?', answers: ['Receiving complaints', 'Making sales or telemarketing', 'Technical support', 'Billing inquiries'], correctAnswer: 1},
            {question: 'What does "Empathy" mean in customer service?', answers: ['Feeling sorry for the customer', 'Understanding and sharing the customer\'s feelings', 'Following a script perfectly', 'Transferring the call quickly'], correctAnswer: 1},
            {question: 'What is an "IVR"?', answers: ['Interactive Voice Response', 'Internal Video Recorder', 'Instant Voice Recovery', 'Integrated Volume Router'], correctAnswer: 0},
            {question: 'What is "FCR" in call center metrics?', answers: ['Fast Call Resolution', 'First Call Resolution', 'Final Customer Report', 'Full Call Recording'], correctAnswer: 1},
            {question: 'When a customer is angry, what is the first thing an agent should do?', answers: ['Hang up', 'Argue back', 'Listen and remain calm', 'Transfer to a manager immediately'], correctAnswer: 2},
            {question: 'What does "BPO" stand for?', answers: ['Business Process Outsourcing', 'Basic Program Organization', 'Billing and Payment Office', 'Business People Online'], correctAnswer: 0},
            {question: 'What is a "Script" in a contact center?', answers: ['A computer program', 'A guide used by agents to handle conversations', 'A medical prescription', 'A list of employee names'], correctAnswer: 1},
            {question: 'What is "QA" in a call center environment?', answers: ['Question Answer', 'Quality Assurance', 'Quick Access', 'Quantity Assessment'], correctAnswer: 1},
            {question: 'Which of the following is considered "Phone Etiquette"?', answers: ['Eating while talking', 'Speaking clearly and politely', 'Interrupting the customer', 'Using slang'], correctAnswer: 1},
            {question: 'What is "Escalation"?', answers: ['Promoting an agent', 'Transferring a difficult case to a higher authority', 'Increasing the volume of the headset', 'Ending the shift'], correctAnswer: 1},
            {question: 'What does "Active Listening" involve?', answers: ['Multi-tasking', 'Providing feedback and confirming understanding', 'Staying silent the whole time', 'Thinking of what to eat next'], correctAnswer: 1},
            {question: 'What is "CSAT"?', answers: ['Call System Alert Tool', 'Customer Satisfaction Score', 'Company Salary and Taxes', 'Center Safety and Trust'], correctAnswer: 1},
            {question: 'What is an "Inbound" call?', answers: ['A call made by the agent', 'A call received from a customer', 'An internal call', 'A prank call'], correctAnswer: 1},
            {question: 'What is "Wrap-up Time"?', answers: ['Lunch break', 'Time taken to finish tasks after a call ends', 'The time spent on hold', 'The end of the year report'], correctAnswer: 1},
            {question: 'What is "Cold Calling"?', answers: ['Calling in winter', 'Calling someone who hasn\'t expressed interest', 'Calling a friend', 'Calling a tech support line'], correctAnswer: 1},
            {question: 'What is "Soft Skills"?', answers: ['Typing skills', 'Interpersonal and communication skills', 'Programming skills', 'Hardware repair skills'], correctAnswer: 1},
            {question: 'What is "Queue" in a call center?', answers: ['The agent\'s desk', 'The line of waiting calls', 'The lunch line', 'The office hallway'], correctAnswer: 1},
            {question: 'What is "Verbal Communication"?', answers: ['Body language', 'Spoken words and tone', 'Email writing', 'Hand gestures'], correctAnswer: 1}
        ];
    }
    // CSS - Computer Systems Servicing
    if (strand === 'CSS' && subject === 'Computer Systems Servicing') {
        return [
            {question: 'What tool is used to protect components from static electricity?', answers: ['Screwdriver', 'Anti-static Wrist Strap', 'Pliers', 'Flashlight'], correctAnswer: 1},
            {question: 'What is the first step when troubleshooting a PC that won\'t turn on?', answers: ['Replace the CPU', 'Check the power cable', 'Reinstall Windows', 'Buy a new monitor'], correctAnswer: 1},
            {question: 'Which tool is used to test a network cable?', answers: ['Multimeter', 'LAN Tester', 'Crimping Tool', 'Punch down tool'], correctAnswer: 1},
            {question: 'What software is used to create a bootable USB drive?', answers: ['MS Word', 'Rufus', 'Photoshop', 'Excel'], correctAnswer: 1},
            {question: 'What is "Safe Mode" in Windows?', answers: ['A mode for playing games', 'A diagnostic mode with limited drivers', 'A faster version of Windows', 'A mode for internet browsing only'], correctAnswer: 1},
            {question: 'Which tool is used to attach RJ45 connectors to a UTP cable?', answers: ['Wire Stripper', 'Crimping Tool', 'Screwdriver', 'Soldering Iron'], correctAnswer: 1},
            {question: 'What is the purpose of "Disk Cleanup"?', answers: ['To remove dust from the hard drive', 'To delete unnecessary system files', 'To fix broken hardware', 'To speed up the fan'], correctAnswer: 1},
            {question: 'What does "Defragmentation" do?', answers: ['Deletes files', 'Organizes data on a hard drive for faster access', 'Cleans the screen', 'Increases RAM size'], correctAnswer: 1},
            {question: 'Which of the following is a symptom of a failing Hard Drive?', answers: ['Loud clicking noises', 'Mouse moving too fast', 'Keyboard lights flashing', 'Monitor too bright'], correctAnswer: 0},
            {question: 'What is a "Device Driver"?', answers: ['The person using the computer', 'Software that allows the OS to talk to hardware', 'A tool for opening the case', 'A type of printer cable'], correctAnswer: 1},
            {question: 'What should you use to clean dust inside a computer case?', answers: ['Vacuum cleaner', 'Compressed air', 'Wet cloth', 'Detergent'], correctAnswer: 1},
            {question: 'What does "Form Factor" refer to?', answers: ['The color of the PC', 'The physical size and shape of hardware', 'The speed of the internet', 'The price of the parts'], correctAnswer: 1},
            {question: 'Which partition contains the operating system files?', answers: ['Data Partition', 'System Partition (C:)', 'Recovery Partition', 'Extended Partition'], correctAnswer: 1},
            {question: 'What is "Malware"?', answers: ['New hardware', 'Malicious software designed to harm a system', 'A type of system update', 'A cleaning tool'], correctAnswer: 1},
            {question: 'Which command fixes file system errors in Windows?', answers: ['ping', 'chkdsk', 'format', 'exit'], correctAnswer: 1},
            {question: 'What is a "Registry" in Windows?', answers: ['A list of users', 'A database that stores configuration settings', 'A log of all websites visited', 'The recycle bin'], correctAnswer: 1},
            {question: 'What is "Virtualization"?', answers: ['Playing VR games', 'Running multiple OS on one physical machine', 'Cleaning the computer remotely', 'Increasing monitor resolution'], correctAnswer: 1},
            {question: 'Which tool is used to push wires into a patch panel or keystone jack?', answers: ['Crimping tool', 'Punch Down Tool', 'Long nose pliers', 'Tweezers'], correctAnswer: 1},
            {question: 'What is "Firmware"?', answers: ['Soft pillows', 'Permanent software programmed into read-only memory', 'A type of system fan', 'Update for a mouse'], correctAnswer: 1},
            {question: 'What is "OHS" in computer servicing?', answers: ['Open Hardware System', 'Occupational Health and Safety', 'Operational High Speed', 'Over Head Stability'], correctAnswer: 1}
        ];
    }
    // CSS - Network Cabling
    if (strand === 'CSS' && subject === 'Network Cabling') {
        return [
            {question: 'What does UTP stand for?', answers: ['Universal Transmission Port', 'Unshielded Twisted Pair', 'Unified Transfer Protocol', 'Underground Telephone Pipe'], correctAnswer: 1},
            {question: 'Which connector is standard for Ethernet cables?', answers: ['RJ11', 'RJ45', 'BNC', 'USB-C'], correctAnswer: 1},
            {question: 'What are the two standard wiring schemes for UTP?', answers: ['T568A and T568B', 'Type 1 and Type 2', 'CAT5 and CAT6', 'A1 and B1'], correctAnswer: 0},
            {question: 'A cable with T568A on one end and T568B on the other is a:', answers: ['Straight-through cable', 'Crossover cable', 'Rollover cable', 'Fiber cable'], correctAnswer: 1},
            {question: 'What is the maximum recommended length for a Cat5e cable segment?', answers: ['50 meters', '100 meters', '200 meters', '500 meters'], correctAnswer: 1},
            {question: 'Which type of cable is immune to Electromagnetic Interference (EMI)?', answers: ['STP', 'UTP', 'Fiber Optic', 'Coaxial'], correctAnswer: 2},
            {question: 'What tool is used to remove the outer jacket of a cable?', answers: ['Crimper', 'Wire Stripper', 'Punch down tool', 'Hammer'], correctAnswer: 1},
            {question: 'How many pairs of wires are inside a standard Cat6 cable?', answers: ['2 pairs', '4 pairs', '6 pairs', '8 pairs'], correctAnswer: 1},
            {question: 'Which color wire is always Pin 1 in the T568B standard?', answers: ['Green-White', 'Orange-White', 'Blue-White', 'Brown-White'], correctAnswer: 1},
            {question: 'What is a "Patch Panel" used for?', answers: ['To repair broken cables', 'To organize and connect network cables', 'To increase internet speed', 'To host websites'], correctAnswer: 1},
            {question: 'Which cable is typically used for cable TV and older networks?', answers: ['UTP', 'Fiber Optic', 'Coaxial', 'STP'], correctAnswer: 2},
            {question: 'What is the purpose of the "Twist" in Twisted Pair cables?', answers: ['To make the cable stronger', 'To reduce crosstalk and interference', 'To identify the cable type', 'To save space'], correctAnswer: 1},
            {question: 'Which category of cable is required for 10-Gigabit Ethernet?', answers: ['Cat3', 'Cat5', 'Cat5e', 'Cat6/6a'], correctAnswer: 3},
            {question: 'What does STP stand for?', answers: ['Standard Twisted Pair', 'Shielded Twisted Pair', 'Secure Transfer Protocol', 'Simple Transmission Port'], correctAnswer: 1},
            {question: 'What is a "Straight-through" cable used for?', answers: ['Connecting two identical devices (e.g. PC to PC)', 'Connecting different devices (e.g. PC to Switch)', 'Connecting a router to a phone line', 'Resetting a router'], correctAnswer: 1},
            {question: 'What is the "Attentuation" in cabling?', answers: ['Signal gain', 'Loss of signal strength over distance', 'The price of the cable', 'The color of the wires'], correctAnswer: 1},
            {question: 'Which tool helps you trace a cable in a messy bundle?', answers: ['LAN Tester', 'Tone Generator and Probe', 'Crimper', 'Multimeter'], correctAnswer: 1},
            {question: 'What is the core of a Fiber Optic cable made of?', answers: ['Copper', 'Glass or Plastic', 'Aluminum', 'Gold'], correctAnswer: 1},
            {question: 'Which connector is used for standard telephone lines?', answers: ['RJ45', 'RJ11', 'BNC', 'HDMI'], correctAnswer: 1},
            {question: 'In T568A, which color pair is used for Pins 1 and 2?', answers: ['Orange', 'Green', 'Blue', 'Brown'], correctAnswer: 1}
        ];
    }
    // TVL - Technical Drafting
    if (strand === 'TVL' && subject === 'Technical Drafting') {
        return [
            {question: 'What is the primary tool used for drawing horizontal lines?', answers: ['Protractor', 'T-square', 'Triangle', 'Compass'], correctAnswer: 1},
            {question: 'What does CAD stand for?', answers: ['Computer-Aided Design', 'Control and Design', 'Computed Architectural Drafting', 'Computer-Aided Drawing'], correctAnswer: 0},
            {question: 'Which scale is used for drawing small objects larger than their actual size?', answers: ['Full scale', 'Reduced scale', 'Enlarged scale', 'Metric scale'], correctAnswer: 2},
            {question: 'In orthographic projection, what is the view from the top called?', answers: ['Front view', 'Side view', 'Plan view', 'Perspective'], correctAnswer: 2},
            {question: 'What is the thickness of a visible object line?', answers: ['Thin', 'Medium', 'Thick', 'Extra thin'], correctAnswer: 2},
            {question: 'Which line consists of short dashes and represents hidden edges?', answers: ['Center line', 'Hidden line', 'Section line', 'Dimension line'], correctAnswer: 1},
            {question: 'What tool is used to draw circles and arcs?', answers: ['Divider', 'Protractor', 'Compass', 'Scale'], correctAnswer: 2},
            {question: 'What is the angle of the lines in an isometric drawing?', answers: ['15 degrees', '30 degrees', '45 degrees', '60 degrees'], correctAnswer: 1},
            {question: 'What type of dimensioning is done from a single reference point?', answers: ['Chain dimensioning', 'Datum dimensioning', 'Parallel dimensioning', 'Center dimensioning'], correctAnswer: 1},
            {question: 'What is the purpose of a "Section View"?', answers: ['To show the outside', 'To show internal details', 'To show the color', 'To show the height'], correctAnswer: 1},
            {question: 'Which grade of pencil is the hardest?', answers: ['HB', '2B', '4H', '9H'], correctAnswer: 3},
            {question: 'What is used to protect the drawing when erasing near other lines?', answers: ['Erasing shield', 'Dusting brush', 'Masking tape', 'Drafting tape'], correctAnswer: 0},
            {question: 'The point where two lines meet is called a/an:', answers: ['Apex', 'Vertex', 'Tangent', 'Segment'], correctAnswer: 1},
            {question: 'What drawing shows an object with three faces seen at once?', answers: ['Orthographic', 'Pictorial', 'Schematic', 'Diagram'], correctAnswer: 1},
            {question: 'Which tool is used to measure and lay out angles?', answers: ['Scale', 'Protractor', 'T-square', 'French curve'], correctAnswer: 1},
            {question: 'What does a "Center Line" represent?', answers: ['The edge of an object', 'The axis of symmetry', 'A hidden part', 'A cut surface'], correctAnswer: 1},
            {question: 'In CAD, what command is used to round corners?', answers: ['Chamfer', 'Fillet', 'Offset', 'Trim'], correctAnswer: 1},
            {question: 'What is the standard size of an A4 sheet?', answers: ['210 x 297 mm', '297 x 420 mm', '8.5 x 11 in', '11 x 17 in'], correctAnswer: 0},
            {question: 'A line that touches a circle at only one point is a:', answers: ['Secant', 'Chord', 'Tangent', 'Diameter'], correctAnswer: 2},
            {question: 'What is the purpose of an "Auxiliary View"?', answers: ['To show true shape of inclined surfaces', 'To show the top view', 'To show hidden lines', 'To show the floor plan'], correctAnswer: 0}
        ];
    }
    // TVL - Electronics
    if (strand === 'TVL' && subject === 'Electronics') {
        return [
            {question: 'What is the unit of electrical resistance?', answers: ['Volt', 'Ampere', 'Ohm', 'Watt'], correctAnswer: 2},
            {question: 'Which component stores electrical energy in an electric field?', answers: ['Resistor', 'Capacitor', 'Inductor', 'Diode'], correctAnswer: 1},
            {question: 'What does LED stand for?', answers: ['Light Energy Device', 'Low Emission Diode', 'Light Emitting Diode', 'Long Electronic Display'], correctAnswer: 2},
            {question: 'Which tool is used to join electronic components using heat and lead?', answers: ['Pliers', 'Soldering Iron', 'Multimeter', 'Wire Stripper'], correctAnswer: 1},
            {question: 'What is the function of a Diode?', answers: ['To store charge', 'To amplify signal', 'To allow current in one direction', 'To resist current'], correctAnswer: 2},
            {question: 'What does a Multimeter measure?', answers: ['Voltage only', 'Resistance only', 'Current only', 'All of the above'], correctAnswer: 3},
            {question: 'Which component is used to amplify or switch electronic signals?', answers: ['Transistor', 'Transformer', 'Fuse', 'Switch'], correctAnswer: 0},
            {question: 'What is the standard voltage for a common AA battery?', answers: ['1.5V', '3.7V', '9V', '12V'], correctAnswer: 0},
            {question: 'What type of current is provided by a wall outlet?', answers: ['DC', 'AC', 'Static', 'Magnetic'], correctAnswer: 1},
            {question: 'What is the purpose of a Fuse?', answers: ['To increase voltage', 'To protect circuit from overcurrent', 'To store energy', 'To dim lights'], correctAnswer: 1},
            {question: 'Which law relates Voltage, Current, and Resistance?', answers: ['Newton\'s Law', 'Ohm\'s Law', 'Boyle\'s Law', 'Watt\'s Law'], correctAnswer: 1},
            {question: 'What does PCB stand for?', answers: ['Power Control Board', 'Personal Computer Board', 'Printed Circuit Board', 'Primary Circuit Block'], correctAnswer: 2},
            {question: 'Which component reduces the voltage in a circuit?', answers: ['Transformer', 'Resistor', 'Battery', 'Generator'], correctAnswer: 1},
            {question: 'What tool is used to remove solder from a joint?', answers: ['Soldering iron', 'Desoldering pump', 'Crimper', 'Oscilloscope'], correctAnswer: 1},
            {question: 'What color code represents the number 0 on a resistor?', answers: ['Black', 'Brown', 'Red', 'Gold'], correctAnswer: 0},
            {question: 'In a series circuit, if one bulb breaks, the others will:', answers: ['Stay on', 'Get brighter', 'Turn off', 'Flicker'], correctAnswer: 2},
            {question: 'What is the frequency of AC power in the Philippines?', answers: ['50 Hz', '60 Hz', '100 Hz', '120 Hz'], correctAnswer: 1},
            {question: 'What is the main material used in semiconductors?', answers: ['Copper', 'Silver', 'Silicon', 'Iron'], correctAnswer: 2},
            {question: 'A "Short Circuit" occurs when current flows through:', answers: ['A high resistance path', 'An unintended path with zero resistance', 'A switch', 'A capacitor'], correctAnswer: 1},
            {question: 'What does "IC" stand for?', answers: ['Internal Circuit', 'Integrated Circuit', 'Instant Current', 'Ion Controller'], correctAnswer: 1}
        ];
    }
    // TVL - Carpentry
    if (strand === 'TVL' && subject === 'Carpentry') {
        return [
            {question: 'What tool is used for driving and pulling out nails?', answers: ['Mallet', 'Claw Hammer', 'Sledgehammer', 'Ball-peen Hammer'], correctAnswer: 1},
            {question: 'Which saw is used for cutting wood across the grain?', answers: ['Rip saw', 'Crosscut saw', 'Coping saw', 'Back saw'], correctAnswer: 1},
            {question: 'What is the standard size of a plywood sheet in feet?', answers: ['3x6', '4x8', '5x10', '2x4'], correctAnswer: 1},
            {question: 'Which tool is used to check if a surface is perfectly vertical?', answers: ['Level bar', 'Plumb bob', 'Chalk line', 'Steel square'], correctAnswer: 1},
            {question: 'What is the term for a joint where two pieces of wood meet at 90 degrees?', answers: ['Butt joint', 'Miter joint', 'Lap joint', 'Dovetail joint'], correctAnswer: 0},
            {question: 'What power tool is used for smoothing and leveling wood?', answers: ['Router', 'Electric Planer', 'Jigsaw', 'Drill'], correctAnswer: 1},
            {question: 'What is the actual thickness of a "2x4" piece of lumber?', answers: ['2" x 4"', '1.5" x 3.5"', '1.75" x 3.75"', '2.5" x 4.5"'], correctAnswer: 1},
            {question: 'Which tool is used to mark a straight line between two points using powder?', answers: ['Pencil', 'Chalk line', 'Tape measure', 'Caliper'], correctAnswer: 1},
            {question: 'What is used to fill small holes and cracks in wood?', answers: ['Wood glue', 'Wood filler', 'Varnish', 'Sealant'], correctAnswer: 1},
            {question: 'Which nail is used for finishing work where the head should be hidden?', answers: ['Common nail', 'Finishing nail', 'Concrete nail', 'Roofing nail'], correctAnswer: 1},
            {question: 'What type of wood is known for being hard and durable (e.g., Narra)?', answers: ['Softwood', 'Hardwood', 'Plywood', 'Lumber'], correctAnswer: 1},
            {question: 'What tool is used for making curved cuts in thin wood?', answers: ['Hand saw', 'Jigsaw', 'Circular saw', 'Mitre saw'], correctAnswer: 1},
            {question: 'What is the purpose of a "Try Square"?', answers: ['To measure height', 'To check for squareness (90 degrees)', 'To cut wood', 'To pull nails'], correctAnswer: 1},
            {question: 'What is used to protect wood from rot and termites?', answers: ['Paint', 'Wood preservative', 'Water', 'Glue'], correctAnswer: 1},
            {question: 'Which joint is known for its strength in drawer construction?', answers: ['Butt joint', 'Dovetail joint', 'Miter joint', 'Scarf joint'], correctAnswer: 1},
            {question: 'What is the "kerf" of a saw?', answers: ['The handle', 'The width of the cut made by the blade', 'The length of the blade', 'The sharpness'], correctAnswer: 1},
            {question: 'What is a "Chisel" used for?', answers: ['Driving nails', 'Carving or cutting away small pieces of wood', 'Measuring', 'Sanding'], correctAnswer: 1},
            {question: 'What hardware is used to allow a door to swing?', answers: ['Lockset', 'Hinge', 'Bolt', 'Latch'], correctAnswer: 1},
            {question: 'What safety gear protects the eyes from flying wood chips?', answers: ['Earplugs', 'Safety Goggles', 'Gloves', 'Mask'], correctAnswer: 1},
            {question: 'The process of removing the rough edges of lumber is called:', answers: ['Sanding', 'Planing', 'Cutting', 'Fastening'], correctAnswer: 1}
        ];
    }
    // TVL - Plumbing
    if (strand === 'TVL' && subject === 'Plumbing') {
        return [
            {question: 'What is the standard pipe used for water supply lines today?', answers: ['PVC', 'PPR', 'Cast Iron', 'Lead'], correctAnswer: 1},
            {question: 'What device prevents sewer gases from entering the building?', answers: ['Faucet', 'P-trap', 'Valve', 'Coupling'], correctAnswer: 1},
            {question: 'What is the purpose of a "Teflon Tape"?', answers: ['To clean pipes', 'To seal threaded pipe joints', 'To insulate wires', 'To glue PVC'], correctAnswer: 1},
            {question: 'Which valve is used to turn off the water supply to the whole house?', answers: ['Check valve', 'Gate valve', 'Float valve', 'Ball valve'], correctAnswer: 1},
            {question: 'What tool is used to tighten and loosen large pipes?', answers: ['Screwdriver', 'Pipe Wrench', 'Pliers', 'Hammer'], correctAnswer: 1},
            {question: 'What is a "Vent Stack" used for?', answers: ['To carry water', 'To release sewer gases and balance pressure', 'To store water', 'To heat water'], correctAnswer: 1},
            {question: 'What does "PVC" stand for?', answers: ['Pressure Valve Connector', 'Polyvinyl Chloride', 'Private Vent Circuit', 'Piping Volume Control'], correctAnswer: 1},
            {question: 'Which tool is used to clear clogs in toilets?', answers: ['Wrench', 'Plunger', 'Drill', 'Saw'], correctAnswer: 1},
            {question: 'What is "Soldering" in plumbing used for?', answers: ['Joining PVC', 'Joining Copper pipes', 'Joining Concrete', 'Fixing leaks in wood'], correctAnswer: 1},
            {question: 'What is the purpose of a "Check Valve"?', answers: ['To stop water flow', 'To allow water to flow in only one direction', 'To increase pressure', 'To measure water usage'], correctAnswer: 1},
            {question: 'What is a "Union" in piping?', answers: ['A type of glue', 'A fitting that allows easy disconnection of pipes', 'A government group', 'A long pipe'], correctAnswer: 1},
            {question: 'What pipe is commonly used for drainage and waste?', answers: ['Galvanized iron', 'Orange/Gray PVC', 'Copper', 'PPR'], correctAnswer: 1},
            {question: 'What tool is used to cut plastic pipes cleanly?', answers: ['Knife', 'PVC Pipe Cutter', 'Hacksaw', 'Chisel'], correctAnswer: 1},
            {question: 'What is a "Faucet"?', answers: ['A pipe', 'A device that controls the flow of liquid', 'A drain', 'A water tank'], correctAnswer: 1},
            {question: 'Which fitting is used to change the direction of a pipe by 90 degrees?', answers: ['Coupling', 'Elbow', 'Tee', 'Cap'], correctAnswer: 1},
            {question: 'What does a "Water Meter" measure?', answers: ['Water pressure', 'Volume of water consumed', 'Water temperature', 'Water purity'], correctAnswer: 1},
            {question: 'What is "Flux" used for in soldering?', answers: ['To heat the pipe', 'To clean the metal surface and help solder flow', 'To cool the pipe', 'To add color'], correctAnswer: 1},
            {question: 'What is a "Septic Tank"?', answers: ['A water storage tank', 'An underground chamber for sewage treatment', 'A kitchen sink', 'A shower part'], correctAnswer: 1},
            {question: 'What is "Backflow"?', answers: ['A fast-flowing river', 'The reverse flow of contaminated water into clean water', 'A leak in the roof', 'High water pressure'], correctAnswer: 1},
            {question: 'What is the standard height of a kitchen sink from the floor?', answers: ['24 inches', '36 inches', '48 inches', '12 inches'], correctAnswer: 1}
        ];
    }
    // TVL - Tile Setting
    if (strand === 'TVL' && subject === 'Tile Setting') {
        return [
            {question: 'What tool is used to cut tiles in a straight line accurately?', answers: ['Hacksaw', 'Tile Cutter', 'Chisel', 'Pliers'], correctAnswer: 1},
            {question: 'What is used to fill the gaps between tiles once the adhesive is set?', answers: ['Mortar', 'Grout', 'Paint', 'Glue'], correctAnswer: 1},
            {question: 'What tool is used to tap tiles into place without cracking them?', answers: ['Metal hammer', 'Rubber mallet', 'Wooden block', 'Stone'], correctAnswer: 1},
            {question: 'What are the small plastic pieces used to keep tiles evenly spaced?', answers: ['Spacers', 'Wedges', 'Nails', 'Shims'], correctAnswer: 0},
            {question: 'Which trowel is used to apply tile adhesive to ensure proper coverage?', answers: ['Pointed trowel', 'Notched trowel', 'Flat trowel', 'Bull float'], correctAnswer: 1},
            {question: 'What is the purpose of "Back-buttering" a tile?', answers: ['To clean it', 'To apply adhesive to the back of the tile for better bond', 'To make it shiny', 'To waterproof the front'], correctAnswer: 1},
            {question: 'Which type of tile is most durable and water-resistant for bathrooms?', answers: ['Wood tile', 'Porcelain tile', 'Carpet tile', 'Paper tile'], correctAnswer: 1},
            {question: 'What is used to cut circular holes in tiles for pipe fittings?', answers: ['Tile nippers', 'Diamond hole saw', 'Glass cutter', 'Screwdriver'], correctAnswer: 1},
            {question: 'What is the standard mixing ratio for tile adhesive?', answers: ['Manufacturer specifications', '1:1 ratio', '1:5 ratio', 'Just water'], correctAnswer: 0},
            {question: 'What tool is used to spread grout into the joints?', answers: ['Grout float', 'Steel trowel', 'Paintbrush', 'Sponge'], correctAnswer: 0},
            {question: 'What is the "Substrate" in tile setting?', answers: ['The tile itself', 'The surface on which the tile is installed', 'The grout', 'The cleaning solution'], correctAnswer: 1},
            {question: 'What is a "Bullnose" tile used for?', answers: ['The center of the floor', 'Finished edges and corners', 'Under the sink', 'The ceiling'], correctAnswer: 1},
            {question: 'How long should you usually wait before grouting installed tiles?', answers: ['5 minutes', '24 hours', '1 week', 'Immediately'], correctAnswer: 1},
            {question: 'What is the main cause of tiles "tenting" or lifting up?', answers: ['Too much grout', 'Lack of expansion joints', 'Wrong tile color', 'Using too many spacers'], correctAnswer: 1},
            {question: 'Which tool is used to remove small, irregular pieces of tile?', answers: ['Hammer', 'Tile Nippers', 'Saw', 'Drill'], correctAnswer: 1},
            {question: 'What is "Thinset"?', answers: ['A type of tile', 'A mortar used to attach tiles to surfaces', 'A cleaning chemical', 'A spacer'], correctAnswer: 1},
            {question: 'What is the purpose of a "Spirit Level" in tile setting?', answers: ['To measure distance', 'To ensure tiles are flat and even', 'To mix grout', 'To cut tiles'], correctAnswer: 1},
            {question: 'What should be used to clean excess grout off the tile surface?', answers: ['Steel wool', 'Damp sponge', 'Dry towel', 'Sandpaper'], correctAnswer: 1},
            {question: 'What is a "Mosaics" tile?', answers: ['A very large tile', 'Small tiles often held together on a mesh sheet', 'A broken tile', 'A glass window'], correctAnswer: 1},
            {question: 'Why is it important to check the "Lot Number" on tile boxes?', answers: ['To see the price', 'To ensure consistent color and size (shade variations)', 'To see the brand', 'To count the tiles'], correctAnswer: 1}
        ];
    }
    // TVL - Masonry
    if (strand === 'TVL' && subject === 'Masonry') {
        return [
            {question: 'What is the primary binder used in masonry mortar?', answers: ['Lime', 'Cement', 'Sand', 'Clay'], correctAnswer: 1},
            {question: 'What tool is used for picking up and spreading mortar on bricks?', answers: ['Shovel', 'Brick Trowel', 'Level', 'Hammer'], correctAnswer: 1},
            {question: 'What is the ratio of a "Class B" concrete mix?', answers: ['1:2:4', '1:2.5:5', '1:3:6', '1:4:8'], correctAnswer: 1},
            {question: 'What is the purpose of "Rebar" (Reinforcing Bar)?', answers: ['To make concrete look better', 'To provide tensile strength to concrete', 'To make it dry faster', 'To reduce the cost'], correctAnswer: 1},
            {question: 'What is the standard size of a Concrete Hollow Block (CHB) width?', answers: ['2 inches', '4, 5, or 6 inches', '10 inches', '12 inches'], correctAnswer: 1},
            {question: 'What tool is used to check the vertical alignment of a wall?', answers: ['Spirit Level', 'Plumb Bob', 'T-square', 'Measuring Tape'], correctAnswer: 1},
            {question: 'What is "Curing" in concrete masonry?', answers: ['Adding salt', 'Maintaining moisture to allow proper hydration/strength', 'Drying it with fans', 'Painting it immediately'], correctAnswer: 1},
            {question: 'What is a "Course" in masonry?', answers: ['A student lesson', 'A single horizontal row of bricks or blocks', 'A type of cement', 'A mixing tool'], correctAnswer: 1},
            {question: 'What is "Grout" used for in masonry blocks?', answers: ['To decorate the surface', 'To fill the cores of CHBs for added strength', 'To clean the blocks', 'To paint the wall'], correctAnswer: 1},
            {question: 'Which tool is used to strike off excess mortar from joints?', answers: ['Jointer', 'Hammer', 'Screwdriver', 'Pliers'], correctAnswer: 0},
            {question: 'What is "Slump Test" used for in masonry?', answers: ['To check wall height', 'To measure the consistency and workability of concrete', 'To check brick weight', 'To measure sand'], correctAnswer: 1},
            {question: 'What is the "Footing" of a wall?', answers: ['The top part', 'The foundation that distributes the load to the ground', 'The decorative part', 'The window frame'], correctAnswer: 1},
            {question: 'What is "Efflorescence"?', answers: ['A type of flower', 'White crystalline salt deposits on masonry surfaces', 'A strong cement', 'A brick-laying technique'], correctAnswer: 1},
            {question: 'Which mix is used for plastering walls?', answers: ['Concrete mix', 'Mortar/Finish mix (Cement and fine sand)', 'Gravel mix', 'Pure cement'], correctAnswer: 1},
            {question: 'What tool is used to level large areas of wet concrete?', answers: ['Hand trowel', 'Bull Float', 'Chisel', 'Sponge'], correctAnswer: 1},
            {question: 'What is a "Header" in bricklaying?', answers: ['The person in charge', 'A brick laid with its end facing the wall surface', 'A very long brick', 'The top row'], correctAnswer: 1},
            {question: 'What type of sand is best for masonry mortar?', answers: ['River sand (Screened)', 'Beach sand', 'Garden soil', 'Clay'], correctAnswer: 0},
            {question: 'What is "Bonding" in masonry?', answers: ['Using glue', 'The overlapping pattern of bricks for strength', 'Talking to coworkers', 'Painting a wall'], correctAnswer: 1},
            {question: 'What tool is used to break bricks or blocks to size?', answers: ['Steel square', 'Brick Hammer/Mason\'s Hammer', 'Saw', 'Level'], correctAnswer: 1},
            {question: 'What is the purpose of a "Batter Board"?', answers: ['To mix cement', 'To hold strings that mark the layout of a foundation', 'To cook', 'To store bricks'], correctAnswer: 1}
        ];
    }
    // TRM - Tourism Promotion
    if (strand === 'TRM' && subject === 'Tourism Promotion') {
        return [
            {question: 'What is the primary goal of tourism promotion?', answers: ['To decrease travel', 'To increase awareness and attract visitors', 'To build new hotels', 'To set airplane schedules'], correctAnswer: 1},
            {question: 'What does "FAM" trip stand for?', answers: ['Family Travel', 'Familiarization Trip', 'Fast Area Movement', 'Famous Attraction Marketing'], correctAnswer: 1},
            {question: 'Which of the "4 Ps" of marketing deals with how the customer gets the product?', answers: ['Product', 'Price', 'Place', 'Promotion'], correctAnswer: 2},
            {question: 'What is a "Target Market" in tourism?', answers: ['A place where souvenirs are sold', 'A specific group of people most likely to visit', 'The local grocery store', 'An airport terminal'], correctAnswer: 1},
            {question: 'What does "DMO" stand for?', answers: ['Direct Marketing Office', 'Destination Management Organization', 'Daily Moving Operations', 'Digital Media Operator'], correctAnswer: 1},
            {question: 'Which promotional tool uses social media influencers?', answers: ['Print Advertising', 'Digital Marketing', 'Direct Mail', 'Radio Ads'], correctAnswer: 1},
            {question: 'What is a "Slogan" in tourism promotion?', answers: ['A legal contract', 'A catchy phrase used to identify a destination', 'A map of the area', 'A list of hotel prices'], correctAnswer: 1},
            {question: 'What is "Sustainable Tourism"?', answers: ['Tourism that ignores nature', 'Tourism that minimizes negative impacts on the environment', 'Tourism for rich people only', 'Tourism that happens only in summer'], correctAnswer: 1},
            {question: 'Which of these is a "Tangible" tourism product?', answers: ['A hotel room', 'A tour guide\'s story', 'The feeling of relaxation', 'Customer service'], correctAnswer: 0},
            {question: 'What is "Boutique" marketing?', answers: ['Marketing to everyone', 'Marketing specialized, unique services to a niche', 'Marketing for department stores', 'Government-funded ads'], correctAnswer: 1},
            {question: 'What does "ROI" mean in an ad campaign?', answers: ['Rate of Interest', 'Return on Investment', 'Region of Influence', 'Route of Information'], correctAnswer: 1},
            {question: 'A "Brochure" is an example of what kind of promotion?', answers: ['Public Relations', 'Sales Literature', 'Personal Selling', 'Broadcast'], correctAnswer: 1},
            {question: 'What is "Niche Tourism"?', answers: ['Mass tourism', 'Specialized travel based on specific interests', 'Camping in the woods', 'Traveling by bus only'], correctAnswer: 1},
            {question: 'What is "Word of Mouth" marketing?', answers: ['Paid radio ads', 'Unpaid recommendations from satisfied customers', 'Yelling in the street', 'A press release'], correctAnswer: 1},
            {question: 'What is "Ecotourism"?', answers: ['Cheap travel', 'Responsible travel to natural areas', 'Shopping in big cities', 'Traveling to luxury resorts'], correctAnswer: 1},
            {question: 'Which organization is responsible for tourism in the Philippines?', answers: ['DFA', 'DOT', 'DOH', 'DOE'], correctAnswer: 1},
            {question: 'What is a "Brand Identity"?', answers: ['The price of a ticket', 'The visual and emotional image of a destination', 'The name of the pilot', 'The weight of luggage'], correctAnswer: 1},
            {question: 'What is "Public Relations" (PR)?', answers: ['Selling tickets directly', 'Building a positive image through media coverage', 'Hiring more staff', 'Building new roads'], correctAnswer: 1},
            {question: 'What is "Seasonality" in tourism?', answers: ['A type of spice', 'Fluctuations in visitor numbers based on the time of year', 'The number of airplanes', 'The age of the tourists'], correctAnswer: 1},
            {question: 'What is the "It’s More Fun in the Philippines" campaign an example of?', answers: ['Local government law', 'Nationwide tourism branding', 'A movie title', 'A private hotel ad'], correctAnswer: 1}
        ];
    }
    // TRM - Tour Guiding
    if (strand === 'TRM' && subject === 'Tour Guiding') {
        return [
            {question: 'What is the most important quality of a professional tour guide?', answers: ['Good at math', 'Excellent communication skills', 'Being a fast runner', 'Owning a car'], correctAnswer: 1},
            {question: 'What is a "Commentary"?', answers: ['A complaint from a guest', 'The narrative provided by a guide during a tour', 'A list of hotel rules', 'A flight schedule'], correctAnswer: 1},
            {question: 'Which of the following is a "Hard Skill" for a tour guide?', answers: ['Empathy', 'First Aid certification', 'Patience', 'A sense of humor'], correctAnswer: 1},
            {question: 'What is the first thing a guide should do when meeting a group?', answers: ['Start walking', 'Give a warm greeting and introduction', 'Collect tips', 'Tell everyone to be quiet'], correctAnswer: 1},
            {question: 'What is a "Voucher"?', answers: ['A type of suitcase', 'A document used to confirm and pay for services', 'A tour guide\'s license', 'A map of the city'], correctAnswer: 1},
            {question: 'How should a guide handle a "No-show"?', answers: ['Wait forever', 'Follow company policy and contact the guest/office', 'Leave immediately without checking', 'Cry'], correctAnswer: 1},
            {question: 'What is an "Itinerary"?', answers: ['A passport', 'A detailed plan or route of a journey', 'A list of passengers', 'A type of vehicle'], correctAnswer: 1},
            {question: 'What is "Risk Management" for a guide?', answers: ['Buying insurance', 'Identifying and minimizing potential hazards', 'Ignoring the weather', 'Letting guests do whatever they want'], correctAnswer: 1},
            {question: 'What is a "Feedback Form" used for?', answers: ['To give to the police', 'To measure guest satisfaction and improve service', 'To list the menu', 'To calculate the guide\'s salary'], correctAnswer: 1},
            {question: 'What is "Interpretation" in tour guiding?', answers: ['Translating word for word only', 'Making a site meaningful and interesting to guests', 'Singing a song', 'Reading from a textbook'], correctAnswer: 1},
            {question: 'Which tool is used by guides to be heard in large crowds?', answers: ['Megaphone/Portable PA system', 'Whistle', 'Drum', 'Flashlight'], correctAnswer: 0},
            {question: 'What should a guide do if they don’t know the answer to a question?', answers: ['Make up a lie', 'Be honest and offer to find out the answer', 'Ignore the guest', 'Tell them the question is stupid'], correctAnswer: 1},
            {question: 'What is "Group Dynamics"?', answers: ['The speed of the bus', 'The way individuals in a group interact with each other', 'The cost of the tour', 'The weight of the group'], correctAnswer: 1},
            {question: 'Where should a guide stand when addressing a group outdoors?', answers: ['With their back to the sun', 'Facing the sun', 'Behind the group', 'Far away from the group'], correctAnswer: 0},
            {question: 'What is "Ethics" in tour guiding?', answers: ['Making as much money as possible', 'Professional and moral conduct toward guests and sites', 'Being a fast walker', 'Wearing a uniform'], correctAnswer: 1},
            {question: 'What is a "Step-on Guide"?', answers: ['A guide who steps on toes', 'A local specialist who joins a tour for a specific site', 'A bus driver', 'A tourist'], correctAnswer: 1},
            {question: 'What is "Logistics" in guiding?', answers: ['The history of the site', 'The coordination of transport, timing, and meals', 'The language spoken', 'The camera used by the guest'], correctAnswer: 1},
            {question: 'Which of these is a "Physical" hazard during a tour?', answers: ['A boring story', 'Uneven walkways', 'A late bus', 'Wrong food'], correctAnswer: 1},
            {question: 'What is the "Closing" of a tour?', answers: ['Locking the door', 'Summarizing the day and thanking the guests', 'Leaving without saying anything', 'Asking for more money'], correctAnswer: 1},
            {question: 'What is a "Heritage Site"?', answers: ['A new shopping mall', 'A place of cultural or historical significance', 'A modern airport', 'A private house'], correctAnswer: 1}
        ];
    }
    // TRM - Events Management
    if (strand === 'TRM' && subject === 'Events Management') {
        return [
            {question: 'What does "MICE" stand for?', answers: ['Meetings, Incentives, Conventions, Exhibitions', 'Many Interesting Cultural Events', 'Management, Information, Control, Evaluation', 'More International Career Events'], correctAnswer: 0},
            {question: 'What is a "Venue"?', answers: ['A type of food', 'The location where an event takes place', 'A guest list', 'An event budget'], correctAnswer: 1},
            {question: 'What is the "Lead Time"?', answers: ['The time during the event', 'The time available for planning before the event', 'The length of the speech', 'The time to clean up'], correctAnswer: 1},
            {question: 'What is a "RFP"?', answers: ['Ready For Party', 'Request For Proposal', 'Report For Pricing', 'Return For Payment'], correctAnswer: 1},
            {question: 'Which document outlines the tasks and deadlines for an event?', answers: ['Guest List', 'Event Timeline/Action Plan', 'Menu Card', 'Thank you note'], correctAnswer: 1},
            {question: 'What is "Catering"?', answers: ['Cleaning the venue', 'Providing food and drink services', 'Selling tickets', 'Hiring security'], correctAnswer: 1},
            {question: 'What is "Break-even Point" for an event?', answers: ['Maximum profit', 'Where total revenue equals total expenses', 'The end of the party', 'When a glass breaks'], correctAnswer: 1},
            {question: 'What is a "B2B" event?', answers: ['Birthday to Birthday', 'Business to Business', 'Back to Back', 'Better to Best'], correctAnswer: 1},
            {question: 'What is "Risk Assessment" in events?', answers: ['Counting the money', 'Identifying potential dangers and planning safety', 'Choosing the decorations', 'Sending invitations'], correctAnswer: 1},
            {question: 'What is a "Registration Desk" for?', answers: ['To eat lunch', 'To check in attendees and provide materials', 'To store trash', 'To hide from guests'], correctAnswer: 1},
            {question: 'What does "AV" stand for?', answers: ['Audio-Visual', 'Advanced Video', 'Always Valid', 'Active Venue'], correctAnswer: 0},
            {question: 'What is a "Keynote Speaker"?', answers: ['The person who locks the door', 'The main featured speaker of a conference', 'A singer', 'A security guard'], correctAnswer: 1},
            {question: 'What is "Post-Event Evaluation"?', answers: ['Planning the next party', 'Analyzing the success and areas for improvement', 'Paying the bills only', 'Cleaning the room'], correctAnswer: 1},
            {question: 'What is a "Sponsor"?', answers: ['A guest who pays full price', 'An organization that provides funds in exchange for promotion', 'A volunteer', 'A family member'], correctAnswer: 1},
            {question: 'What is "Contingency Planning"?', answers: ['Buying more flowers', 'Having a "Plan B" for unexpected problems', 'Ignoring the budget', 'Inviting more people'], correctAnswer: 1},
            {question: 'What is "Capacity" for a venue?', answers: ['The weight of the building', 'The maximum number of people allowed', 'The color of the walls', 'The price of the rent'], correctAnswer: 1},
            {question: 'What is a "Workshop"?', answers: ['A factory', 'An interactive session where participants learn skills', 'A long speech', 'A formal dinner'], correctAnswer: 1},
            {question: 'What is "Site Inspection"?', answers: ['Looking at a website', 'Visiting a venue to check its suitability', 'Cleaning a house', 'Building a stage'], correctAnswer: 1},
            {question: 'What is "Collateral" in event marketing?', answers: ['Printed materials like brochures and flyers', 'A type of debt', 'The event staff', 'The venue lights'], correctAnswer: 0},
            {question: 'What is a "Hybrid Event"?', answers: ['An event for cars', 'An event that combines in-person and virtual elements', 'A very loud party', 'A small meeting'], correctAnswer: 1}
        ];
    }
    // TRM - Travel Services
    if (strand === 'TRM' && subject === 'Travel Services') {
        return [
            {question: 'What does "IATA" stand for?', answers: ['International Air Transport Association', 'Internal Airline Ticket Agency', 'International Aviation Travel Authority', 'Inter-Air Tourism Agency'], correctAnswer: 0},
            {question: 'What is a "Travel Agency"?', answers: ['A place to buy luggage', 'A business that sells travel-related products and services', 'A bus station', 'A hotel lobby'], correctAnswer: 1},
            {question: 'What is a "Passport"?', answers: ['A bus pass', 'An official government document for international travel', 'A hotel key', 'A medical record'], correctAnswer: 1},
            {question: 'What is a "Visa" in travel?', answers: ['A credit card', 'An official authorization to enter a specific country', 'A plane ticket', 'A travel insurance policy'], correctAnswer: 1},
            {question: 'What does "GDS" stand for in travel bookings?', answers: ['Global Distribution System', 'General Data Storage', 'Global Destination Service', 'General Delivery System'], correctAnswer: 0},
            {question: 'What is an "Electronic Ticket" (E-ticket)?', answers: ['A paper ticket', 'A digital version of a paper ticket', 'A lottery ticket', 'A credit card receipt'], correctAnswer: 1},
            {question: 'What is "Travel Insurance"?', answers: ['A guarantee of a fun trip', 'A plan that covers financial losses during travel', 'A life insurance policy', 'A car rental agreement'], correctAnswer: 1},
            {question: 'What is a "Round Trip"?', answers: ['A trip to nowhere', 'A journey to a destination and back to the starting point', 'A trip around the world', 'A one-way flight'], correctAnswer: 1},
            {question: 'What is "Commission" for a travel agent?', answers: ['A tax', 'A percentage of the sale price paid by the supplier', 'A monthly salary', 'A tip from the customer'], correctAnswer: 1},
            {question: 'What is a "Package Tour"?', answers: ['A box of souvenirs', 'A pre-arranged trip with multiple services included', 'A trip to the post office', 'A hiking trip'], correctAnswer: 1},
            {question: 'What does "ETA" stand for?', answers: ['Electronic Travel Authority', 'Estimated Time of Arrival', 'Easy Travel Agency', 'Endless Tour Association'], correctAnswer: 1},
            {question: 'What is "Overbooking"?', answers: ['Booking too many activities', 'Selling more seats/rooms than available', 'A library term', 'A very long book'], correctAnswer: 1},
            {question: 'What is a "Connection Flight"?', answers: ['A flight with free Wi-Fi', 'A journey requiring passengers to change planes', 'A direct flight', 'A flight with friends'], correctAnswer: 1},
            {question: 'What is "Baggage Allowance"?', answers: ['The weight of the plane', 'The amount of luggage a passenger can carry for free', 'The cost of a suitcase', 'A place to store bags'], correctAnswer: 1},
            {question: 'What is "Jet Lag"?', answers: ['A fast airplane', 'Fatigue caused by traveling across multiple time zones', 'Fear of flying', 'A type of fuel'], correctAnswer: 1},
            {question: 'What is a "Wholesaler" in travel?', answers: ['A small travel agent', 'A company that creates tours and sells them to agents', 'A souvenir shop', 'A local guide'], correctAnswer: 1},
            {question: 'What is "Customs" at the airport?', answers: ['A place to buy clothes', 'The department that controls goods entering a country', 'A traditional dance', 'A guest list'], correctAnswer: 1},
            {question: 'What is "Inbound Tourism"?', answers: ['Locals traveling inside their country', 'Foreigners visiting a country', 'People leaving a country', 'Traveling by train'], correctAnswer: 1},
            {question: 'What is a "Direct Flight"?', answers: ['A flight that never stops', 'A flight between two cities with no change in flight number', 'A private jet', 'A flight with many stops'], correctAnswer: 1},
            {question: 'What is a "Concierge"?', answers: ['A chef', 'A hotel staff member who assists guests with travel tasks', 'A pilot', 'A taxi driver'], correctAnswer: 1}
        ];
    }
    // TRM - Cruise Ship Management
    if (strand === 'TRM' && subject === 'Cruise Ship Management') {
        return [
            {question: 'What is the "Galley" on a cruise ship?', answers: ['The captain\'s room', 'The kitchen', 'The engine room', 'The swimming pool'], correctAnswer: 1},
            {question: 'What does "Aft" mean in ship terminology?', answers: ['Front of the ship', 'Rear of the ship', 'Left side', 'Right side'], correctAnswer: 1},
            {question: 'What is a "Cabin" or "Stateroom"?', answers: ['A storage room', 'A guest\'s bedroom', 'A dining area', 'The steering room'], correctAnswer: 1},
            {question: 'Who is the "Purser" on a ship?', answers: ['The person in charge of food', 'The officer in charge of accounts and documents', 'The person who cleans the rooms', 'The lead singer'], correctAnswer: 1},
            {question: 'What is a "Muster Drill"?', answers: ['A cooking class', 'A mandatory safety exercise for all passengers', 'A dance party', 'A cleaning routine'], correctAnswer: 1},
            {question: 'What is the "Bridge" of a ship?', answers: ['A place to walk across', 'The control center for navigation', 'The dining hall', 'The laundry room'], correctAnswer: 1},
            {question: 'What does "Port Side" mean?', answers: ['Right side', 'Left side', 'Front side', 'Bottom side'], correctAnswer: 1},
            {question: 'What is a "Tender" in cruising?', answers: ['A soft bed', 'A small boat used to transport guests to shore', 'A kind waiter', 'A payment method'], correctAnswer: 1},
            {question: 'What is "Shore Excursion"?', answers: ['Cleaning the beach', 'A tour or activity organized at a port of call', 'A swimming lesson', 'Fishing from the ship'], correctAnswer: 1},
            {question: 'What is the "Lido Deck"?', answers: ['The lowest deck', 'The deck with the swimming pool and buffet', 'The engine deck', 'The storage deck'], correctAnswer: 1},
            {question: 'What is "Embarkation"?', answers: ['Leaving the ship', 'The process of boarding the ship', 'Cleaning the ship', 'Eating dinner'], correctAnswer: 1},
            {question: 'What is a "Knot" at sea?', answers: ['A tangled rope', 'A unit of speed equal to one nautical mile per hour', 'A type of fish', 'A group of passengers'], correctAnswer: 1},
            {question: 'What does "Starboard" mean?', answers: ['Left side', 'Right side', 'Back side', 'Top side'], correctAnswer: 1},
            {question: 'What is "Disembarkation"?', answers: ['Boarding the ship', 'The process of leaving the ship at the end of a cruise', 'Repairing the ship', 'Watching a show'], correctAnswer: 1},
            {question: 'What is a "Sea Day"?', answers: ['A day when it rains', 'A day when the ship is traveling between ports', 'A day for fishing', 'The first day of the year'], correctAnswer: 1},
            {question: 'What is the "Hull" of the ship?', answers: ['The top part', 'The main body or outer shell of the ship', 'The dining room', 'The flagpole'], correctAnswer: 1},
            {question: 'Who is responsible for all entertainment on the ship?', answers: ['Captain', 'Cruise Director', 'Chef', 'Engineer'], correctAnswer: 1},
            {question: 'What is "All-inclusive" on a cruise?', answers: ['Nothing is included', 'Most food, drinks, and entertainment are in the price', 'Guests must pay for everything', 'Only for adults'], correctAnswer: 1},
            {question: 'What is a "Port of Call"?', answers: ['A phone call from the ship', 'A scheduled stop on the ship\'s itinerary', 'A type of wine', 'The captain\'s office'], correctAnswer: 1},
            {question: 'What is "Maritime Law"?', answers: ['Laws about farming', 'Laws related to commerce and navigation on the sea', 'Laws of the city', 'Laws about airplanes'], correctAnswer: 1}
        ];
    }
    // TRM - Local Guiding
    if (strand === 'TRM' && subject === 'Local Guiding') {
        return [
            {question: 'What is a "Local Guide"?', answers: ['A guide for international flights', 'A guide who specializes in a specific city or area', 'A bus driver', 'A hotel manager'], correctAnswer: 1},
            {question: 'What is the primary benefit of a local guide?', answers: ['They are cheap', 'They have in-depth knowledge of local culture and history', 'They can drive fast', 'They know how to cook'], correctAnswer: 1},
            {question: 'What is "Local Lore"?', answers: ['A type of food', 'Traditional knowledge or stories passed down in an area', 'A legal document', 'A modern map'], correctAnswer: 1},
            {question: 'Which of these is a "Local Attraction"?', answers: ['An international airport', 'A town plaza with historical statues', 'The moon', 'A generic supermarket'], correctAnswer: 1},
            {question: 'What is the best way for a local guide to show "Hospitality"?', answers: ['Ignoring the guests', 'Being friendly, helpful, and welcoming', 'Charging extra for everything', 'Talking only about themselves'], correctAnswer: 1},
            {question: 'What is a "Walking Tour"?', answers: ['A tour on a bus', 'A tour where guests explore a site on foot', 'A marathon', 'A rest period'], correctAnswer: 1},
            {question: 'What is "Cultural Sensitivity"?', answers: ['Being allergic to food', 'Respecting the customs and beliefs of local people', 'Making fun of local traditions', 'Only eating at fast food places'], correctAnswer: 1},
            {question: 'What is a "Souvenir"?', answers: ['A heavy bag', 'An item kept as a reminder of a place or event', 'A plane ticket', 'A hotel key'], correctAnswer: 1},
            {question: 'What is "Sustainability" in local guiding?', answers: ['Using all resources quickly', 'Promoting tours that protect local heritage and environment', 'Closing all shops', 'Only for the rich'], correctAnswer: 1},
            {question: 'What should a local guide do if there is a sudden rain shower?', answers: ['Run away', 'Have an alternative plan or provide shelter/umbrellas', 'Tell guests to go home', 'Pretend it\'s not raining'], correctAnswer: 1},
            {question: 'What is "Community-Based Tourism"?', answers: ['Tourism owned by big corporations', 'Tourism managed and run by local community members', 'Tourism in space', 'Tourism with no people'], correctAnswer: 1},
            {question: 'What is a "Hidden Gem"?', answers: ['A buried diamond', 'A less-known but beautiful local spot', 'A broken rock', 'A famous museum'], correctAnswer: 1},
            {question: 'Why is "Storytelling" important for local guides?', answers: ['To make guests sleep', 'To make history and facts engaging and memorable', 'To lie to people', 'To waste time'], correctAnswer: 1},
            {question: 'What is "Domestic Tourism"?', answers: ['Foreigners visiting', 'Residents traveling within their own country', 'Traveling with pets', 'Cleaning a house'], correctAnswer: 1},
            {question: 'What is a "Heritage Walk"?', answers: ['A run in the park', 'A tour focused on historical and cultural landmarks', 'A shopping trip', 'A visit to a factory'], correctAnswer: 1},
            {question: 'What should a local guide wear?', answers: ['A tuxedo', 'A clean and appropriate professional or traditional attire', 'Pajamas', 'Swimwear'], correctAnswer: 1},
            {question: 'What is "Agritourism"?', answers: ['Traveling to big cities', 'Tourism based on visiting farms or agricultural sites', 'A sports event', 'A computer convention'], correctAnswer: 1},
            {question: 'What is the role of the "Local Government Unit" (LGU) in tourism?', answers: ['To stay at home', 'To support and regulate local tourism activities', 'To buy all the hotels', 'To fly the airplanes'], correctAnswer: 1},
            {question: 'What is "Authenticity" in local guiding?', answers: ['Providing fake stories', 'Providing genuine experiences of the local way of life', 'Using artificial decorations', 'Following a generic script'], correctAnswer: 1},
            {question: 'What is "First Aid" knowledge for a local guide?', answers: ['Knowing how to cook', 'Basic medical help until professional help arrives', 'Knowing how to dance', 'Knowing the price of medicine'], correctAnswer: 1}
        ];
    }
    // HRS - Cookery
    if (strand === 'HRS' && subject === 'Cookery') {
        return [
            {question: 'What is the term for "everything in its place" before cooking?', answers: ['Mise en place', 'Sous vide', 'Al dente', 'Gratiné'], correctAnswer: 0},
            {question: 'What is the standard temperature for the "Danger Zone" in food safety?', answers: ['0°C to 10°C', '5°C to 60°C', '40°C to 140°C', '100°C to 200°C'], correctAnswer: 1},
            {question: 'Which knife is best for peeling small fruits and vegetables?', answers: ['Chef knife', 'Paring knife', 'Cleaver', 'Serrated knife'], correctAnswer: 1},
            {question: 'What cooking method uses dry heat in an oven?', answers: ['Boiling', 'Braising', 'Roasting', 'Steaming'], correctAnswer: 2},
            {question: 'What do you call the liquid that remains after solids are removed from stocks?', answers: ['Broth', 'Sauce', 'Roux', 'Gravy'], correctAnswer: 0},
            {question: 'Which mother sauce uses a white roux and milk?', answers: ['Hollandaise', 'Béchamel', 'Velouté', 'Espagnole'], correctAnswer: 1},
            {question: 'What is the correct way to wash hands before handling food?', answers: ['Rinse with water', '20 seconds with soap and warm water', 'Wipe on apron', 'Use hand sanitizer only'], correctAnswer: 1},
            {question: 'What is "Al Dente" usually applied to?', answers: ['Meat', 'Pasta', 'Soup', 'Bread'], correctAnswer: 1},
            {question: 'What tool is used to measure small amounts of liquid or dry ingredients?', answers: ['Measuring spoons', 'Scale', 'Whisk', 'Ladle'], correctAnswer: 0},
            {question: 'What do you call the process of browning meat quickly over high heat?', answers: ['Simmering', 'Searing', 'Poaching', 'Blanching'], correctAnswer: 1},
            {question: 'Which cutting technique produces very fine, tiny cubes?', answers: ['Julienne', 'Brunoise', 'Batonnet', 'Chiffonade'], correctAnswer: 1},
            {question: 'What is the purpose of "Blanching" vegetables?', answers: ['To fully cook them', 'To plunge into boiling water then ice water', 'To fry them until crispy', 'To dry them out'], correctAnswer: 1},
            {question: 'What thickener is made from equal parts flour and fat?', answers: ['Slurry', 'Roux', 'Liaison', 'Beurre manié'], correctAnswer: 1},
            {question: 'What is the internal temperature requirement for cooked poultry?', answers: ['145°F', '155°F', '165°F', '180°F'], correctAnswer: 2},
            {question: 'What tool is used for folding ingredients or scraping bowls?', answers: ['Rubber spatula', 'Tongs', 'Turner', 'Whisk'], correctAnswer: 0},
            {question: 'What is "Cross-contamination"?', answers: ['Mixing different spices', 'Transfer of bacteria from one surface to another', 'Cooking two meals at once', 'Using the same oven'], correctAnswer: 1},
            {question: 'What does "Basting" mean?', answers: ['Boiling in fat', 'Pouring juices or fat over food while cooking', 'Cutting into strips', 'Soaking in vinegar'], correctAnswer: 1},
            {question: 'Which of these is a moist-heat cooking method?', answers: ['Grilling', 'Baking', 'Steaming', 'Sautéing'], correctAnswer: 2},
            {question: 'What is the "First In, First Out" (FIFO) method used for?', answers: ['Serving guests', 'Stock rotation', 'Washing dishes', 'Hiring staff'], correctAnswer: 1},
            {question: 'Which knife cut is used for leafy greens to create ribbon-like strips?', answers: ['Dice', 'Chiffonade', 'Mince', 'Julienne'], correctAnswer: 1}
        ];
    }
    // HRS - Bread and Pastry
    if (strand === 'HRS' && subject === 'Bread and Pastry') {
        return [
            {question: 'What is the leavening agent typically used in bread making?', answers: ['Baking soda', 'Yeast', 'Cornstarch', 'Cream of tartar'], correctAnswer: 1},
            {question: 'Which flour has the highest protein content?', answers: ['Cake flour', 'All-purpose flour', 'Bread flour', 'Pastry flour'], correctAnswer: 2},
            {question: 'What is the process of working dough to develop gluten called?', answers: ['Whisking', 'Folding', 'Kneading', 'Sifting'], correctAnswer: 2},
            {question: 'What is the main purpose of "Creaming" butter and sugar?', answers: ['To melt the butter', 'To incorporate air', 'To dissolve the sugar completely', 'To make it salty'], correctAnswer: 1},
            {question: 'What do you call a pastry made with many thin layers of dough and fat?', answers: ['Sponge cake', 'Puff pastry', 'Muffin', 'Cookie'], correctAnswer: 1},
            {question: 'What is "Proofing" in bread making?', answers: ['Checking the oven temp', 'Final rise of the dough before baking', 'Adding seeds on top', 'Mixing the flour'], correctAnswer: 1},
            {question: 'Which tool is used to cut fat into flour for pie crusts?', answers: ['Whisk', 'Pastry blender', 'Rolling pin', 'Spatula'], correctAnswer: 1},
            {question: 'What is the primary leavener in Choux pastry (Eclairs)?', answers: ['Yeast', 'Steam', 'Baking powder', 'Baking soda'], correctAnswer: 1},
            {question: 'What is the temperature of "Lukewarm" water for yeast activation?', answers: ['0°C', '38°C to 43°C', '80°C', '100°C'], correctAnswer: 1},
            {question: 'What prevents eggs from curdling when adding hot liquid?', answers: ['Stirring slowly', 'Tempering', 'Freezing', 'Adding sugar'], correctAnswer: 1},
            {question: 'What is a "Docker" used for in baking?', answers: ['Cutting dough', 'Pricking holes in dough to prevent air bubbles', 'Icing a cake', 'Measuring flour'], correctAnswer: 1},
            {question: 'What does "Blind Baking" mean?', answers: ['Baking with eyes closed', 'Baking a pie crust without filling', 'Baking at night', 'Baking without an oven'], correctAnswer: 1},
            {question: 'What gives Angel Food Cake its structure?', answers: ['Egg whites', 'Butter', 'Yeast', 'Egg yolks'], correctAnswer: 0},
            {question: 'Which of these is a chemical leavener?', answers: ['Yeast', 'Baking powder', 'Air', 'Steam'], correctAnswer: 1},
            {question: 'What is "Ganache"?', answers: ['A type of bread', 'A mixture of chocolate and cream', 'A fruit tart', 'A sugar glaze'], correctAnswer: 1},
            {question: 'What is the "Wash" applied to the top of bread for shine?', answers: ['Water only', 'Egg wash', 'Flour dust', 'Oil'], correctAnswer: 1},
            {question: 'What does "Sifting" do for flour?', answers: ['Adds weight', 'Removes lumps and aerates', 'Makes it wet', 'Changes the color'], correctAnswer: 1},
            {question: 'What is the standard oven temp for most cakes?', answers: ['200°F', '350°F', '500°F', '150°F'], correctAnswer: 1},
            {question: 'What is a "Turntable" used for?', answers: ['Mixing dough', 'Decorating and icing cakes', 'Frying donuts', 'Slicing bread'], correctAnswer: 1},
            {question: 'Which ingredient inhibits yeast growth if too much is added?', answers: ['Sugar', 'Salt', 'Flour', 'Water'], correctAnswer: 1}
        ];
    }
    // HRS - Food and Beverage
    if (strand === 'HRS' && subject === 'Food and Beverage') {
        return [
            {question: 'What side should food be served from in formal service?', answers: ['Left', 'Right', 'Back', 'Front'], correctAnswer: 0},
            {question: 'What does "Beverage" refer to?', answers: ['Only alcohol', 'Any drinkable liquid', 'Cold food', 'Table decorations'], correctAnswer: 1},
            {question: 'Which tool is used by a waiter to carry multiple plates?', answers: ['Tray', 'Bucket', 'Cart', 'Basket'], correctAnswer: 0},
            {question: 'What is a "Cover" in restaurant terms?', answers: ['A table cloth', 'A single guest place setting', 'The kitchen lid', 'The entrance fee'], correctAnswer: 1},
            {question: 'What is "Upselling"?', answers: ['Lowering the price', 'Suggesting more expensive or additional items', 'Selling the furniture', 'Giving free food'], correctAnswer: 1},
            {question: 'Which side should beverages be served from?', answers: ['Left', 'Right', 'Center', 'Top'], correctAnswer: 1},
            {question: 'What is the "Captain’s Order" pad used for?', answers: ['Cleaning tables', 'Recording guest orders', 'Calculating taxes', 'Drawing maps'], correctAnswer: 1},
            {question: 'What is "Mis-en-scene"?', answers: ['Cooking food', 'Setting the ambiance and cleanliness of the dining room', 'Washing dishes', 'Staff training'], correctAnswer: 1},
            {question: 'What is a "Table d’Hote" menu?', answers: ['A la carte', 'A fixed price menu with set courses', 'A buffet', 'A drink list'], correctAnswer: 1},
            {question: 'What tool is used to remove crumbs from the table?', answers: ['Napkin', 'Crumber', 'Sponge', 'Vacuum'], correctAnswer: 1},
            {question: 'What is "Bussing" a table?', answers: ['Driving guests home', 'Clearing away used dishes and cutlery', 'Setting the menu', 'Washing the floor'], correctAnswer: 1},
            {question: 'Which wine is usually served with red meat?', answers: ['White wine', 'Red wine', 'Rosé', 'Sparkling water'], correctAnswer: 1},
            {question: 'What is a "Sommelier"?', answers: ['A head chef', 'A wine specialist', 'A dishwasher', 'A security guard'], correctAnswer: 1},
            {question: 'What is "Russian Service"?', answers: ['Buffet style', 'Food prepared in kitchen and served from platters', 'Guest cooks their own', 'Fast food'], correctAnswer: 1},
            {question: 'What is the purpose of a "Service Cloth"?', answers: ['To wipe the floor', 'To protect hands from hot plates', 'To blow nose', 'To fan the guest'], correctAnswer: 1},
            {question: 'What is an "Aperitif"?', answers: ['A dessert', 'A drink served before a meal', 'A heavy soup', 'The final bill'], correctAnswer: 1},
            {question: 'What does "Comp" mean in a restaurant?', answers: ['Competition', 'Complimentary (free of charge)', 'Computerized', 'Complicated'], correctAnswer: 1},
            {question: 'What is the "Demitasse" cup used for?', answers: ['Soup', 'Espresso/Small coffee', 'Beer', 'Milkshake'], correctAnswer: 1},
            {question: 'Which glass is used for champagne?', answers: ['Highball', 'Flute', 'Tumbler', 'Mug'], correctAnswer: 1},
            {question: 'What is "Sequence of Service"?', answers: ['The recipe for a dish', 'The step-by-step procedure of serving a guest', 'The staff schedule', 'The order of washing dishes'], correctAnswer: 1}
        ];
    }
    // HRS - Housekeeping
    if (strand === 'HRS' && subject === 'Housekeeping') {
        return [
            {question: 'What is the primary responsibility of Housekeeping?', answers: ['Cooking', 'Maintaining cleanliness and orderliness', 'Booking flights', 'Parking cars'], correctAnswer: 1},
            {question: 'What is "Turndown Service"?', answers: ['Turning off the lights', 'Evening service where the bed is prepared for sleep', 'Cleaning the pool', 'Checking out'], correctAnswer: 1},
            {question: 'What does "DND" stand for?', answers: ['Do Not Drink', 'Do Not Disturb', 'Daily Neatness Duty', 'Door Not Done'], correctAnswer: 1},
            {question: 'What is a "Chambermaid’s Trolley"?', answers: ['A lunch cart', 'A cart used to transport cleaning supplies and linens', 'A luggage rack', 'A laundry bin'], correctAnswer: 1},
            {question: 'Which chemical is used to kill germs on surfaces?', answers: ['Detergent', 'Disinfectant', 'Polish', 'Wax'], correctAnswer: 1},
            {question: 'What is "Lost and Found" procedure?', answers: ['Keeping items for yourself', 'Logging and storing items guests left behind', 'Throwing things away', 'Selling items'], correctAnswer: 1},
            {question: 'What is a "Vacant Ready" room?', answers: ['A room being cleaned', 'A room that is clean and available for a guest', 'A dirty room', 'A room with a guest'], correctAnswer: 1},
            {question: 'What is "Linens"?', answers: ['Food items', 'Bed sheets, towels, and pillowcases', 'Cleaning chemicals', 'Electronic devices'], correctAnswer: 1},
            {question: 'What is "Par Stock"?', answers: ['A type of soup', 'The minimum level of supplies required to meet daily needs', 'Staff count', 'A hotel floor'], correctAnswer: 1},
            {question: 'What is "Stripping the bed"?', answers: ['Making the bed', 'Removing all used linens from the bed', 'Buying new sheets', 'Folding the duvet'], correctAnswer: 1},
            {question: 'Which tool is used for sucking up dust from carpets?', answers: ['Broom', 'Vacuum cleaner', 'Mop', 'Squeegee'], correctAnswer: 1},
            {question: 'What is "Discrepancy Report"?', answers: ['A staff complaint', 'A report showing difference between front office and housekeeping room status', 'A list of broken items', 'A weather report'], correctAnswer: 1},
            {question: 'What is "Deep Cleaning"?', answers: ['Daily dusting', 'Thorough cleaning of areas not covered in daily routine', 'Washing windows only', 'Spraying perfume'], correctAnswer: 1},
            {question: 'What is an "Amenity"?', answers: ['A cleaning tool', 'A complimentary item for guest convenience (e.g., soap, shampoo)', 'A hotel rule', 'A staff member'], correctAnswer: 1},
            {question: 'What color code is often used for cleaning toilets?', answers: ['Blue', 'Red', 'Green', 'Yellow'], correctAnswer: 1},
            {question: 'What is "Soiled Linen"?', answers: ['Dirty laundry', 'New sheets', 'Curtains', 'Table cloths'], correctAnswer: 0},
            {question: 'What is "Dry Cleaning"?', answers: ['Washing with water', 'Cleaning using chemical solvents without water', 'Hanging clothes in the sun', 'Ironing'], correctAnswer: 1},
            {question: 'What is a "Squeegee" used for?', answers: ['Cleaning toilets', 'Removing water from windows or glass', 'Dusting furniture', 'Polishing shoes'], correctAnswer: 1},
            {question: 'What is "Occupied" status?', answers: ['Room is empty', 'A guest is currently registered to the room', 'Room is broken', 'Room is being cleaned'], correctAnswer: 1},
            {question: 'What is the "Janitor’s Closet"?', answers: ['A guest room', 'Storage for heavy cleaning equipment and bulk chemicals', 'The manager\'s office', 'The laundry room'], correctAnswer: 1}
        ];
    }
    // HRS - Front Office
    if (strand === 'HRS' && subject === 'Front Office') {
        return [
            {question: 'What is the "Hub" of the hotel?', answers: ['The kitchen', 'The Front Office', 'The laundry', 'The parking lot'], correctAnswer: 1},
            {question: 'What is "Check-in"?', answers: ['Paying the bill', 'The process of guest registration upon arrival', 'Leaving the hotel', 'Ordering food'], correctAnswer: 1},
            {question: 'What does "PMS" stand for in hotel operations?', answers: ['Personal Message System', 'Property Management System', 'Private Management Service', 'Paper Marking System'], correctAnswer: 1},
            {question: 'What is a "Walk-in" guest?', answers: ['A guest with a reservation', 'A guest who arrives without a reservation', 'A guest who walks a lot', 'A guest who leaves without paying'], correctAnswer: 1},
            {question: 'What is "Rack Rate"?', answers: ['The lowest price', 'The standard, non-discounted price of a room', 'The staff rate', 'The price of a taxi'], correctAnswer: 1},
            {question: 'What is "No-show"?', answers: ['A guest who pays in cash', 'A guest with a reservation who fails to arrive', 'A broken TV', 'A guest without luggage'], correctAnswer: 1},
            {question: 'What is "Folio"?', answers: ['A type of flower', 'A guest\'s account or record of transactions', 'A room key', 'A hotel brochure'], correctAnswer: 1},
            {question: 'What is "Overbooking"?', answers: ['Accepting more reservations than available rooms', 'Booking too many staff', 'Having many guests', 'A full parking lot'], correctAnswer: 0},
            {question: 'What is a "Suite"?', answers: ['A small room', 'A larger room with separate living and sleeping areas', 'A chocolate', 'The hotel lobby'], correctAnswer: 1},
            {question: 'What is "Night Audit"?', answers: ['Cleaning at night', 'The process of verifying and balancing daily financial records', 'Security patrol', 'Night shift cooking'], correctAnswer: 1},
            {question: 'What is "Registration Card"?', answers: ['A credit card', 'A form guests fill out with personal details on arrival', 'A souvenir', 'A staff ID'], correctAnswer: 1},
            {question: 'What is "Concierge"?', answers: ['The person who cleans rooms', 'The person who assists guests with tours, transport, and info', 'The owner', 'The chef'], correctAnswer: 1},
            {question: 'What is "Late Check-out"?', answers: ['Checking out early', 'Staying in the room past the standard departure time', 'Checking in at night', 'Paying the bill late'], correctAnswer: 1},
            {question: 'What is a "Waitlist"?', answers: ['A list of waiters', 'A list of guests waiting for a room to become available', 'A menu', 'A grocery list'], correctAnswer: 1},
            {question: 'What is "Upselling" at the front desk?', answers: ['Giving a free room', 'Suggesting a higher room category for a fee', 'Selling newspapers', 'Offering a discount'], correctAnswer: 1},
            {question: 'What is "GDS"?', answers: ['Global Distribution System', 'General Data System', 'Guest Delivery Service', 'Grand Deluxe Suite'], correctAnswer: 0},
            {question: 'What is "Room Status"?', answers: ['The color of the room', 'The current state of a room (Occupied, Vacant, etc.)', 'The room number', 'The size of the bed'], correctAnswer: 1},
            {question: 'What is "Direct Billing"?', answers: ['Paying cash', 'Sending the bill to a company or agency instead of the guest', 'Paying with a phone', 'Getting a discount'], correctAnswer: 1},
            {question: 'What is "Curb Appeal"?', answers: ['The taste of the food', 'The attractiveness of the hotel’s exterior', 'The speed of the elevator', 'The price of the room'], correctAnswer: 1},
            {question: 'What is a "Master Key"?', answers: ['A key for one room', 'A key that can open all rooms in the hotel', 'A broken key', 'A car key'], correctAnswer: 1}
        ];
    }
    // HRS - Tour Guiding
    if (strand === 'HRS' && subject === 'Tour Guiding') {
        return [
            {question: 'What is the primary role of a tour guide?', answers: ['To cook food', 'To inform and entertain guests about a site', 'To clean the bus', 'To sell insurance'], correctAnswer: 1},
            {question: 'What is an "Itinerary"?', answers: ['A passport', 'A detailed schedule or route of a tour', 'A hotel receipt', 'A bag of snacks'], correctAnswer: 1},
            {question: 'Which of these is a "Soft Skill" for guides?', answers: ['First Aid', 'Empathy and Communication', 'Driving', 'Map reading'], correctAnswer: 1},
            {question: 'What is a "Familiarization (FAM) Tour"?', answers: ['A family vacation', 'A tour for industry professionals to learn about a site', 'A solo trip', 'A tour of a house'], correctAnswer: 1},
            {question: 'What is "Commentary"?', answers: ['A complaint', 'The spoken information provided by the guide', 'The price list', 'A text message'], correctAnswer: 1},
            {question: 'What is a "Voucher"?', answers: ['A credit card', 'A document exchangeable for services', 'A type of vehicle', 'A hat'], correctAnswer: 1},
            {question: 'What is "Interpretation" in guiding?', answers: ['Direct translation only', 'Translating and explaining the significance of a site', 'Singing a song', 'Writing a book'], correctAnswer: 1},
            {question: 'What is the first thing to do during a "Meet and Greet"?', answers: ['Collect tips', 'Proper introduction and welcome', 'Start walking', 'Check the weather'], correctAnswer: 1},
            {question: 'What is "Risk Management"?', answers: ['Spending money', 'Identifying and planning for potential emergencies', 'Ignoring the group', 'Leaving the site'], correctAnswer: 1},
            {question: 'What is "Eco-tourism"?', answers: ['Cheap travel', 'Responsible travel to natural areas that conserves the environment', 'Traveling by car', 'Visiting shopping malls'], correctAnswer: 1},
            {question: 'What is "Heritage"?', answers: ['New buildings', 'Traditions, sites, and objects inherited from the past', 'Modern fashion', 'Future plans'], correctAnswer: 1},
            {question: 'What tool helps a guide be heard in a large group?', answers: ['Whistle', 'Portable Voice Amplifier', 'Drum', 'Flashlight'], correctAnswer: 1},
            {question: 'What is "Logistics" in a tour?', answers: ['The history of the site', 'Planning transport, timing, and meals', 'The language of the guide', 'The price of the ticket'], correctAnswer: 1},
            {question: 'What is "Ethics" for a guide?', answers: ['Following the money', 'Professional conduct and honesty', 'Walking fast', 'Wearing sunglasses'], correctAnswer: 1},
            {question: 'What is a "No-show" in a tour?', answers: ['A guide who is late', 'A guest who doesn’t arrive for the scheduled tour', 'A rainy day', 'A closed museum'], correctAnswer: 1},
            {question: 'What is "Customer Feedback"?', answers: ['A guide\'s opinion', 'The guest’s evaluation of the service', 'The tour price', 'The weather report'], correctAnswer: 1},
            {question: 'What is "Cultural Sensitivity"?', answers: ['Allergy to food', 'Respecting local customs and traditions', 'Speaking loudly', 'Ignoring locals'], correctAnswer: 1},
            {question: 'What is a "Walking Tour"?', answers: ['A tour by car', 'A tour where guests explore on foot', 'A rest period', 'A sleeping break'], correctAnswer: 1},
            {question: 'What is a "Souvenir"?', answers: ['A heavy bag', 'An object kept as a reminder of a place', 'A bus ticket', 'A menu'], correctAnswer: 1},
            {question: 'What should a guide do in case of an accident?', answers: ['Run away', 'Apply First Aid and contact authorities', 'Take a photo', 'Blame the guest'], correctAnswer: 1}
        ];
    }
    // CPG - Computer Programming
    if (strand === 'CPG' && subject === 'Computer Programming') {
        return [
            {question: 'What is a set of step-by-step instructions to solve a problem?', answers: ['Variable', 'Algorithm', 'Compiler', 'Syntax'], correctAnswer: 1},
            {question: 'Which of these is a valid integer?', answers: ['10.5', '"10"', '10', 'True'], correctAnswer: 2},
            {question: 'What type of error prevents a program from running due to grammar rules?', answers: ['Logical Error', 'Runtime Error', 'Syntax Error', 'Human Error'], correctAnswer: 2},
            {question: 'What is a "Boolean" data type?', answers: ['Numbers only', 'Text strings', 'True or False values', 'Decimals'], correctAnswer: 2},
            {question: 'Which loop is used to execute code a specific number of times?', answers: ['If statement', 'For loop', 'Switch', 'Break'], correctAnswer: 1},
            {question: 'What is used to store data that can change during execution?', answers: ['Constant', 'Variable', 'Function', 'Library'], correctAnswer: 1},
            {question: 'What does "=" usually represent in programming?', answers: ['Equality', 'Assignment', 'Addition', 'Comparison'], correctAnswer: 1},
            {question: 'Which symbol is commonly used for comments in many languages?', answers: ['//', '++', '==', '??'], correctAnswer: 0},
            {question: 'What is a "String" in programming?', answers: ['A type of wire', 'A sequence of characters', 'A mathematical formula', 'A loop'], correctAnswer: 1},
            {question: 'What is the index of the first element in an array?', answers: ['1', '0', '-1', 'A'], correctAnswer: 1},
            {question: 'What does "Concat" or "Concatenate" mean?', answers: ['Subtract numbers', 'Delete a file', 'Join two strings together', 'Multiply strings'], correctAnswer: 2},
            {question: 'What is the purpose of an "If-Else" statement?', answers: ['To repeat code', 'To make decisions based on conditions', 'To store data', 'To name a variable'], correctAnswer: 1},
            {question: 'What is "Debugging"?', answers: ['Adding features', 'Finding and fixing errors', 'Deleting the program', 'Buying new hardware'], correctAnswer: 1},
            {question: 'Which operator is used for finding the remainder of a division?', answers: ['/', '*', '%', '^'], correctAnswer: 2},
            {question: 'What is a "Function" or "Method"?', answers: ['A reusable block of code', 'A type of variable', 'A mathematical error', 'A keyboard key'], correctAnswer: 0},
            {question: 'What is "Camel Case"?', answers: ['A way to name files', 'Writing words joined with capital letters (like myVariable)', 'Using underscores', 'Writing in all caps'], correctAnswer: 1},
            {question: 'What happens in an "Infinite Loop"?', answers: ['The program runs once', 'The program never stops running', 'The program deletes itself', 'The computer restarts'], correctAnswer: 1},
            {question: 'What is "Pseudocode"?', answers: ['A fake language', 'Informal description of code for humans', 'Encrypted code', 'Binary'], correctAnswer: 1},
            {question: 'What is the result of 5 + "5" in many dynamic languages?', answers: ['10', '55', 'Error', '0'], correctAnswer: 1},
            {question: 'What does "IDE" stand for?', answers: ['Internal Data Entry', 'Integrated Development Environment', 'Instant Design Editor', 'Internet Design Engine'], correctAnswer: 1}
        ];
    }
    // CPG - Web Development
    if (strand === 'CPG' && subject === 'Web Development') {
        return [
            {question: 'What does HTML stand for?', answers: ['HyperText Markup Language', 'High Tech Modern Language', 'Hyperlink Tool Markup', 'Home Tool Markup Language'], correctAnswer: 0},
            {question: 'Which tag is used to create a hyperlink?', answers: ['<link>', '<a>', '<href>', '<url>'], correctAnswer: 1},
            {question: 'What is the correct tag for the largest heading?', answers: ['<h6>', '<head>', '<heading>', '<h1>'], correctAnswer: 3},
            {question: 'Which CSS property controls the spacing between lines of text?', answers: ['line-height', 'spacing', 'text-indent', 'letter-spacing'], correctAnswer: 0},
            {question: 'What is the "DOM" in web development?', answers: ['Document Object Model', 'Data Oriented Module', 'Digital Output Management', 'Design Object Mode'], correctAnswer: 0},
            {question: 'Which attribute is used to provide an image path?', answers: ['alt', 'src', 'href', 'link'], correctAnswer: 1},
            {question: 'How do you call a function named "myFunction" in JavaScript?', answers: ['call myFunction()', 'myFunction()', 'run myFunction', 'exec.myFunction'], correctAnswer: 1},
            {question: 'Which HTML tag is used to define an internal style sheet?', answers: ['<script>', '<css>', '<style>', '<link>'], correctAnswer: 2},
            {question: 'Which CSS property is used to change the font of an element?', answers: ['font-style', 'font-family', 'text-font', 'font-weight'], correctAnswer: 1},
            {question: 'What is the purpose of the <head> tag?', answers: ['Displaying text', 'Storing metadata and links to scripts', 'Creating a footer', 'Adding images'], correctAnswer: 1},
            {question: 'What is "Responsive Design"?', answers: ['Fast loading sites', 'Layouts that adapt to different screen sizes', 'Websites that answer questions', 'High-color designs'], correctAnswer: 1},
            {question: 'Which symbol is used for an "id" selector in CSS?', answers: ['.', '#', '*', '@'], correctAnswer: 1},
            {question: 'What is a "Backend" language?', answers: ['HTML', 'CSS', 'Node.js', 'Bootstrap'], correctAnswer: 2},
            {question: 'What does "HTTP" stand for?', answers: ['HyperText Transfer Protocol', 'High Technical Task Process', 'Hyperlink Total Text Program', 'Home Tech Transfer Plan'], correctAnswer: 0},
            {question: 'Which tag is used to create an unordered list?', answers: ['<ol>', '<li>', '<ul>', '<list>'], correctAnswer: 2},
            {question: 'What is the default value of the "position" property in CSS?', answers: ['relative', 'fixed', 'absolute', 'static'], correctAnswer: 3},
            {question: 'Which property is used to add space inside an element\'s border?', answers: ['margin', 'padding', 'spacing', 'border-width'], correctAnswer: 1},
            {question: 'What is "JSON"?', answers: ['A JavaScript framework', 'A data format for exchanging information', 'A CSS property', 'A type of loop'], correctAnswer: 1},
            {question: 'Which tag defines a table row?', answers: ['<td>', '<th>', '<tr>', '<table>'], correctAnswer: 2},
            {question: 'What is "GitHub" used for?', answers: ['Hosting websites', 'Version control and collaboration', 'Writing code in the browser', 'Creating images'], correctAnswer: 1}
        ];
    }
    // CPG - Animation
    if (strand === 'CPG' && subject === 'Animation') {
        return [
            {question: 'What is "Squash and Stretch"?', answers: ['Deleting frames', 'Giving a sense of weight and flexibility to objects', 'Changing colors', 'Speeding up the video'], correctAnswer: 1},
            {question: 'What is a "Keyframe"?', answers: ['A heavy frame', 'A drawing that defines the starting and ending points of a smooth transition', 'The first frame only', 'A locked layer'], correctAnswer: 1},
            {question: 'What is "FPS" in animation?', answers: ['Files Per Second', 'Frames Per Second', 'Figures Per Sketch', 'Fast Picture Speed'], correctAnswer: 1},
            {question: 'What is the standard FPS for traditional hand-drawn animation?', answers: ['12 fps', '24 fps', '60 fps', '100 fps'], correctAnswer: 1},
            {question: 'What is "Onion Skinning"?', answers: ['Layering paper', 'Viewing multiple frames at once to see motion', 'A texture tool', 'Deleting background'], correctAnswer: 1},
            {question: 'What is "Anticipation" in animation?', answers: ['The end of a move', 'A small movement before the main action', 'A type of color', 'Slow motion'], correctAnswer: 1},
            {question: 'What is "Tweening"?', answers: ['Two animations at once', 'The process of generating intermediate frames between keyframes', 'Cutting a video', 'Adding sound'], correctAnswer: 1},
            {question: 'What is "Stop Motion"?', answers: ['A broken video', 'Animation using physical objects moved in small increments', 'CGI', 'Live action'], correctAnswer: 1},
            {question: 'What is a "Storyboard"?', answers: ['A list of actors', 'Visual plan of the animation in panel form', 'A script only', 'A book cover'], correctAnswer: 1},
            {question: 'What is "Easing" (Slow In and Slow Out)?', answers: ['Stopping the animation', 'Making movement more natural by accelerating/decelerating', 'Changing the volume', 'Removing details'], correctAnswer: 1},
            {question: 'What is "Rigging" in 3D animation?', answers: ['Adding lights', 'Creating a skeleton for a 3D model to allow movement', 'Rendering the final video', 'Painting textures'], correctAnswer: 1},
            {question: 'What is a "Loop" in animation?', answers: ['A circle drawing', 'An animation that repeats continuously', 'A mistake', 'A fast move'], correctAnswer: 1},
            {question: 'What is "CGI"?', answers: ['Computer Generated Imagery', 'Creative Graphical Interface', 'Center Graphics Info', 'Computerized Grade Index'], correctAnswer: 0},
            {question: 'What is "Persistence of Vision"?', answers: ['Having a clear goal', 'The eye retaining an image for a fraction of a second to create motion', 'Better eyesight', '3D glasses'], correctAnswer: 1},
            {question: 'What is "Pose-to-Pose" animation?', answers: ['Drawing everything at once', 'Drawing key poses first and filling in between later', 'Drawing frame by frame from start to finish', 'Motion capture'], correctAnswer: 1},
            {question: 'What is "Follow Through"?', answers: ['Stopping immediately', 'Parts of the body continuing to move after the character stops', 'Walking fast', 'Looking back'], correctAnswer: 1},
            {question: 'What is "Rotoscoping"?', answers: ['Drawing from imagination', 'Tracing over live-action footage frame by frame', '3D modeling', 'Adding 2D text'], correctAnswer: 1},
            {question: 'What is a "Timeline"?', answers: ['A clock', 'The area where you organize and control animation over time', 'A list of names', 'A color palette'], correctAnswer: 1},
            {question: 'What is "Staging"?', answers: ['Setting up a theater', 'Presenting an idea so that it is unmistakably clear', 'Adding music', 'Ending the film'], correctAnswer: 1},
            {question: 'What is "Cell" (or Cel) animation?', answers: ['Digital only', 'Traditional animation on transparent sheets', 'Phone animation', 'Grid animation'], correctAnswer: 1}
        ];
    }
    // CPG - Illustration
    if (strand === 'CPG' && subject === 'Illustration') {
        return [
            {question: 'What is "Composition" in art?', answers: ['The price of the art', 'The arrangement of elements within a work', 'The type of paint used', 'The size of the paper'], correctAnswer: 1},
            {question: 'What are "Primary Colors"?', answers: ['Orange, Green, Purple', 'Red, Blue, Yellow', 'Black and White', 'Pink, Cyan, Lime'], correctAnswer: 1},
            {question: 'What is "Value" in illustration?', answers: ['How much it costs', 'The lightness or darkness of a color', 'The quality of the paper', 'The artist\'s name'], correctAnswer: 1},
            {question: 'What is "Perspective"?', answers: ['A type of pencil', 'Representing 3D depth on a 2D surface', 'A bright color', 'A fast sketch'], correctAnswer: 1},
            {question: 'What is a "Vector" image?', answers: ['A blurry photo', 'An image made of mathematical paths that can be scaled infinitely', 'A pixel-based photo', 'A scan of paper'], correctAnswer: 1},
            {question: 'What does "RGB" stand for?', answers: ['Red, Green, Blue', 'Real, Great, Bright', 'Red, Grey, Brown', 'Radial, Gradient, Blur'], correctAnswer: 0},
            {question: 'What is "Negative Space"?', answers: ['Bad art', 'The space around and between the subjects of an image', 'Black paint', 'The back of the paper'], correctAnswer: 1},
            {question: 'What is "Line Weight"?', answers: ['The length of a line', 'The thickness or thinness of a line', 'The color of a line', 'The pressure of the pen'], correctAnswer: 1},
            {question: 'What is "Cross-hatching"?', answers: ['Painting with a brush', 'Shading using closely spaced parallel and intersecting lines', 'Mixing colors', 'Erasing mistakes'], correctAnswer: 1},
            {question: 'What does "CMYK" stand for?', answers: ['Cyan, Magenta, Yellow, Key (Black)', 'Color, Mix, Yellow, Kind', 'Cool, Mild, Young, Keen', 'Cyan, Mint, Yellow, Khaki'], correctAnswer: 0},
            {question: 'What is a "Thumbnail Sketch"?', answers: ['A drawing of a thumb', 'A small, quick drawing to plan a composition', 'A finished painting', 'A digital icon'], correctAnswer: 1},
            {question: 'What is "Opacity"?', answers: ['Sharpness', 'The degree of transparency of a layer or color', 'Brightness', 'Saturation'], correctAnswer: 1},
            {question: 'What is "Texture"?', answers: ['The speed of drawing', 'The perceived surface quality or "feel" of an object', 'The color of the sky', 'The weight of the pen'], correctAnswer: 1},
            {question: 'What is a "Gradient"?', answers: ['A type of brush', 'A smooth transition from one color to another', 'A sharp line', 'A dark shadow'], correctAnswer: 1},
            {question: 'What is "Anatomy" in illustration?', answers: ['Drawing trees', 'The study of the structure of the human body for drawing', 'Drawing cars', 'Choosing colors'], correctAnswer: 1},
            {question: 'What is "Resolution" in digital art?', answers: ['A promise', 'The amount of detail (pixels) in an image', 'The color mode', 'The file name'], correctAnswer: 1},
            {question: 'What is "Complementary Colors"?', answers: ['Colors that look bad', 'Colors opposite each other on the color wheel', 'Colors that are the same', 'Black and white'], correctAnswer: 1},
            {question: 'What is a "Canvas"?', answers: ['A tent', 'The surface on which an artist works', 'A type of pencil', 'A computer mouse'], correctAnswer: 1},
            {question: 'What is "Symmetry"?', answers: ['Messy art', 'Balance where one side mirrors the other', 'Different shapes', 'High contrast'], correctAnswer: 1},
            {question: 'What is "Digital Inking"?', answers: ['Using a printer', 'Creating clean, final lines over a sketch using digital tools', 'Scanning a drawing', 'Spilling ink on a tablet'], correctAnswer: 1}
        ];
    }
    // CPG - Computer Systems
    if (strand === 'CPG' && subject === 'Computer Systems') {
        return [
            {question: 'What is the "OS" of a computer?', answers: ['Outer Space', 'Operating System', 'Optical Sensor', 'Open Source'], correctAnswer: 1},
            {question: 'Which component is the "brain" of the computer?', answers: ['RAM', 'Hard Drive', 'CPU', 'Power Supply'], correctAnswer: 2},
            {question: 'What does "RAM" stand for?', answers: ['Read Access Memory', 'Random Access Memory', 'Run Active Module', 'Rapid Area Memory'], correctAnswer: 1},
            {question: 'Which of these is an "Input Device"?', answers: ['Monitor', 'Printer', 'Keyboard', 'Speaker'], correctAnswer: 2},
            {question: 'What is the purpose of a "Motherboard"?', answers: ['To store files', 'To connect all internal components together', 'To display images', 'To cool the PC'], correctAnswer: 1},
            {question: 'What is "Virtual Memory"?', answers: ['Memory on a USB', 'Using hard drive space as extra RAM', 'A type of cloud storage', 'Memory in a VR headset'], correctAnswer: 1},
            {question: 'What does "BIOS" do?', answers: ['Edits photos', 'Initializes hardware during the boot process', 'Connects to the internet', 'Cleans the registry'], correctAnswer: 1},
            {question: 'Which is a "Volatile" type of memory?', answers: ['SSD', 'RAM', 'Hard Drive', 'Flash Drive'], correctAnswer: 1},
            {question: 'What is a "Driver" in computer systems?', answers: ['A person who uses a PC', 'Software that lets the OS communicate with hardware', 'A fast CPU', 'A power cord'], correctAnswer: 1},
            {question: 'What is "Kernel" in an OS?', answers: ['A type of corn', 'The core part of the OS that manages hardware', 'A user interface', 'A virus'], correctAnswer: 1},
            {question: 'What does "GUI" stand for?', answers: ['General User Info', 'Graphical User Interface', 'Global Unit Index', 'Graphic Universal Icon'], correctAnswer: 1},
            {question: 'Which component is responsible for processing graphics?', answers: ['Sound Card', 'GPU', 'NIC', 'PSU'], correctAnswer: 1},
            {question: 'What is "Multitasking" in an OS?', answers: ['One task at a time', 'Running multiple programs simultaneously', 'Many people using one PC', 'Fast typing'], correctAnswer: 1},
            {question: 'What is a "Bit"?', answers: ['A small bite', 'The smallest unit of data (0 or 1)', '8 bytes', 'A type of port'], correctAnswer: 1},
            {question: 'What does "SSD" stand for?', answers: ['Super Speed Disk', 'Solid State Drive', 'System Storage Device', 'Static Soft Drive'], correctAnswer: 1},
            {question: 'What is the purpose of a "Heat Sink"?', answers: ['To store heat', 'To dissipate heat away from the CPU', 'To power the fan', 'To hold the RAM'], correctAnswer: 1},
            {question: 'What is "Formatting" a drive?', answers: ['Changing the color', 'Preparing a storage medium for use by erasing data', 'Naming a file', 'Plugging it in'], correctAnswer: 1},
            {question: 'What is "Plug and Play"?', answers: ['A video game', 'Hardware that works immediately when connected', 'A type of power socket', 'A toy'], correctAnswer: 1},
            {question: 'What does "CLI" stand for?', answers: ['Command Line Interface', 'Computer Logic Index', 'Central Link Info', 'Common Line Input'], correctAnswer: 0},
            {question: 'What is "Defragmentation"?', answers: ['Deleting files', 'Reorganizing data on an HDD for faster access', 'Breaking the hardware', 'Cleaning the screen'], correctAnswer: 1}
        ];
    }
    // CPG - Java Programming
    if (strand === 'CPG' && subject === 'Java Programming') {
        return [
            {question: 'Which keyword is used to create a class in Java?', answers: ['new', 'class', 'public', 'void'], correctAnswer: 1},
            {question: 'What is the entry point of a Java program?', answers: ['start()', 'init()', 'main()', 'run()'], correctAnswer: 2},
            {question: 'Which data type is used for a single character in Java?', answers: ['String', 'char', 'Byte', 'Character'], correctAnswer: 1},
            {question: 'How do you print text to the console in Java?', answers: ['echo("")', 'System.out.println("")', 'print("")', 'console.log("")'], correctAnswer: 1},
            {question: 'Which keyword is used to inherit a class?', answers: ['implements', 'extends', 'imports', 'inherits'], correctAnswer: 1},
            {question: 'What is a "Constructor" in Java?', answers: ['A person who writes code', 'A special method used to initialize objects', 'A type of loop', 'A file saver'], correctAnswer: 1},
            {question: 'Which of these is NOT a primitive data type in Java?', answers: ['int', 'boolean', 'String', 'double'], correctAnswer: 2},
            {question: 'What does "JDK" stand for?', answers: ['Java Development Kit', 'Java Design Key', 'Joint Data Kernel', 'Just Do Knowledge'], correctAnswer: 0},
            {question: 'What is the result of 9 / 2 in Java (integer division)?', answers: ['4.5', '4', '5', 'Error'], correctAnswer: 1},
            {question: 'Which symbol is used for "End of Statement" in Java?', answers: [':', '.', ';', ','], correctAnswer: 2},
            {question: 'What is the purpose of "final" keyword in Java?', answers: ['To end the program', 'To make a variable constant (cannot change)', 'To delete a class', 'To run the code last'], correctAnswer: 1},
            {question: 'Which keyword is used to handle exceptions?', answers: ['try-catch', 'if-else', 'for-while', 'break-continue'], correctAnswer: 0},
            {question: 'What is an "Object" in Java?', answers: ['A variable name', 'An instance of a class', 'A math operator', 'A text file'], correctAnswer: 1},
            {question: 'Which access modifier makes a member accessible only within its own class?', answers: ['public', 'protected', 'private', 'static'], correctAnswer: 2},
            {question: 'What does "JVM" stand for?', answers: ['Java Virtual Machine', 'Java Variable Manager', 'Joint Video Mode', 'Just Valid Memory'], correctAnswer: 0},
            {question: 'How do you find the length of a string "str"?', answers: ['str.size()', 'str.length()', 'str.count', 'len(str)'], correctAnswer: 1},
            {question: 'Which loop is guaranteed to execute at least once?', answers: ['for loop', 'while loop', 'do-while loop', 'if statement'], correctAnswer: 2},
            {question: 'What is "Overloading" in Java?', answers: ['Having too much code', 'Defining multiple methods with the same name but different parameters', 'Running code too fast', 'A system crash'], correctAnswer: 1},
            {question: 'What is "Encapsulation"?', answers: ['Writing fast code', 'Wrapping data and methods into a single unit (class)', 'Deleting unused files', 'Inheriting from parents'], correctAnswer: 1},
            {question: 'What is a "Package" in Java?', answers: ['A box from a store', 'A container for grouping related classes', 'A type of error', 'A software update'], correctAnswer: 1}
        ];
    }
    // SPT - Athletics
    if (strand === 'SPT' && subject === 'Athletics') {
        return [
            {question: 'How many lanes are there on a standard outdoor track?', answers: ['6', '8', '10', '12'], correctAnswer: 1},
            {question: 'What is the standard distance of one lap around a track?', answers: ['200m', '400m', '800m', '1000m'], correctAnswer: 1},
            {question: 'Which event involves clearing a bar at increasing heights using a long pole?', answers: ['High Jump', 'Pole Vault', 'Long Jump', 'Javelin'], correctAnswer: 1},
            {question: 'What is the object passed between runners in a relay race?', answers: ['Baton', 'Stick', 'Racket', 'Ball'], correctAnswer: 0},
            {question: 'How many athletes are in a standard relay team?', answers: ['2', '3', '4', '5'], correctAnswer: 2},
            {question: 'What is a "False Start"?', answers: ['Running too slow', 'Moving before the starting gun fires', 'Falling down', 'Wearing the wrong shoes'], correctAnswer: 1},
            {question: 'Which throwing event uses a heavy metal ball?', answers: ['Discus', 'Hammer', 'Shot Put', 'Javelin'], correctAnswer: 2},
            {question: 'What is the distance of a full Marathon?', answers: ['21.1 km', '42.195 km', '10 km', '50 km'], correctAnswer: 1},
            {question: 'In Long Jump, what happens if an athlete steps over the takeoff board?', answers: ['They try again', 'It is a foul jump', 'They get half points', 'Nothing'], correctAnswer: 1},
            {question: 'Which race involves clearing a series of obstacles?', answers: ['Sprinting', 'Hurdles', 'Walking', 'Marathon'], correctAnswer: 1},
            {question: 'What is the "Decathlon"?', answers: ['A 10-event competition', 'A 5-event competition', 'A 100m sprint', 'A type of shoe'], correctAnswer: 0},
            {question: 'What is the "Crouch Start" used for?', answers: ['Long distance', 'Sprints', 'High jump', 'Walking'], correctAnswer: 1},
            {question: 'In the triple jump, what are the three phases?', answers: ['Run, Jump, Fall', 'Hop, Step, Jump', 'Skip, Hop, Jump', 'Run, Step, Leap'], correctAnswer: 1},
            {question: 'Which throw uses a spear-like implement?', answers: ['Discus', 'Javelin', 'Shot Put', 'Hammer'], correctAnswer: 1},
            {question: 'What is "Pacing"?', answers: ['Running as fast as possible', 'Maintaining a steady speed over a distance', 'Stopping for water', 'Jumping high'], correctAnswer: 1},
            {question: 'In relay races, what is the "Exchange Zone"?', answers: ['The finish line', 'The area where the baton is passed', 'The locker room', 'The starting block'], correctAnswer: 1},
            {question: 'Which of these is considered a field event?', answers: ['100m dash', 'Discus throw', '400m hurdles', 'Steeplechase'], correctAnswer: 1},
            {question: 'What is the standard weight of a men\'s shot put?', answers: ['5.26 kg', '7.26 kg', '10 kg', '4 kg'], correctAnswer: 1},
            {question: 'What is a "Fosbury Flop"?', answers: ['A type of fall', 'A technique in High Jump', 'A sprinting style', 'A throwing error'], correctAnswer: 1},
            {question: 'What is the "Heptathlon"?', answers: ['A 7-event competition', 'A 10-event competition', 'A swim race', 'A cycling race'], correctAnswer: 0}
        ];
    }
    // SPT - Arnis
    if (strand === 'SPT' && subject === 'Arnis') {
        return [
            {question: 'What is the national sport and martial art of the Philippines?', answers: ['Boxing', 'Arnis', 'Basketball', 'Sipa'], correctAnswer: 1},
            {question: 'Which law declared Arnis as the national sport?', answers: ['RA 9850', 'RA 1012', 'RA 7610', 'RA 9165'], correctAnswer: 0},
            {question: 'What is the most common weapon used in Arnis?', answers: ['Metal sword', 'Rattan stick', 'Nunchucks', 'Knife'], correctAnswer: 1},
            {question: 'What is the standard length of an Arnis stick?', answers: ['20 inches', '28 inches', '36 inches', '40 inches'], correctAnswer: 1},
            {question: 'In Arnis, what is "Anyo"?', answers: ['A combat fight', 'A choreographed form or pattern', 'A type of stick', 'A greeting'], correctAnswer: 1},
            {question: 'What is the term for the Arnis greeting or bow?', answers: ['Pugay', 'Salamat', 'Mabuhay', 'Ooos'], correctAnswer: 0},
            {question: 'What is "Sinawali"?', answers: ['A single stick strike', 'Double-stick weaving patterns', 'A defensive block', 'A leg kick'], correctAnswer: 1},
            {question: 'How many striking points are there in basic Arnis?', answers: ['5', '10', '12', '15'], correctAnswer: 2},
            {question: 'What is the term for "Disarming" an opponent?', answers: ['Agaw', 'Suntok', 'Sipa', 'Taga'], correctAnswer: 0},
            {question: 'Which hand usually holds the stick in "Solo Baston"?', answers: ['Left hand', 'Dominant hand', 'Both hands', 'Neither'], correctAnswer: 1},
            {question: 'What is "Espada y Daga"?', answers: ['Stick and shield', 'Sword and dagger', 'Two sticks', 'Bare hands'], correctAnswer: 1},
            {question: 'What is the "Handa" stance?', answers: ['Striking stance', 'Attention/Ready stance', 'Kneeling stance', 'Sitting stance'], correctAnswer: 1},
            {question: 'Striking point #1 in the 12 strikes usually targets what?', answers: ['The knee', 'The left temple', 'The stomach', 'The chest'], correctAnswer: 1},
            {question: 'What is "Abaniko" strike?', answers: ['A fan-like striking motion', 'A straight thrust', 'A downward hit', 'A circular block'], correctAnswer: 0},
            {question: 'The Arnis stick is also called what?', answers: ['Baston', 'Arnis', 'Tabak', 'Sibat'], correctAnswer: 0},
            {question: 'In competition, what color are the two sides?', answers: ['Black and White', 'Red and Blue', 'Green and Yellow', 'Gold and Silver'], correctAnswer: 1},
            {question: 'What gear is mandatory for "Laban" (Combat)?', answers: ['Headgear and Body Armor', 'Gloves only', 'None', 'Knee pads only'], correctAnswer: 0},
            {question: 'What is "Sangga"?', answers: ['Strike', 'Block/Defense', 'Greeting', 'Footwork'], correctAnswer: 1},
            {question: 'Who is known as the Father of Modern Arnis?', answers: ['Remy Presas', 'Jose Rizal', 'Manny Pacquiao', 'Lapu-Lapu'], correctAnswer: 0},
            {question: 'What does "Doble Baston" mean?', answers: ['Single stick', 'Double sticks', 'No sticks', 'Broken stick'], correctAnswer: 1}
        ];
    }
    // SPT - Basketball
    if (strand === 'SPT' && subject === 'Basketball') {
        return [
            {question: 'How many players per team are on the court at once?', answers: ['4', '5', '6', '11'], correctAnswer: 1},
            {question: 'How many points is a shot made from inside the arc?', answers: ['1', '2', '3', '4'], correctAnswer: 1},
            {question: 'What is a "Double Dribble"?', answers: ['Dribbling too fast', 'Dribbling with both hands or stopping and starting again', 'A high bounce', 'Passing while dribbling'], correctAnswer: 1},
            {question: 'What is the height of the basketball rim from the floor?', answers: ['8 feet', '9 feet', '10 feet', '12 feet'], correctAnswer: 2},
            {question: 'How many seconds does a team have to get the ball across half-court?', answers: ['5', '8', '10', '24'], correctAnswer: 1},
            {question: 'A free throw is worth how many points?', answers: ['1', '2', '3', '0'], correctAnswer: 0},
            {question: 'What is it called when a player moves their feet without dribbling?', answers: ['Double Dribble', 'Traveling', 'Carry', 'Personal Foul'], correctAnswer: 1},
            {question: 'How many personal fouls can a player get in the NBA before being disqualified?', answers: ['4', '5', '6', '7'], correctAnswer: 2},
            {question: 'How many seconds is the shot clock in FIBA/Professional play?', answers: ['10', '12', '24', '30'], correctAnswer: 2},
            {question: 'What is a "Triple-Double"?', answers: ['3 players scoring 10 points', 'Double digits in 3 statistical categories', 'A 3-point shot', 'Winning 3 games'], correctAnswer: 1},
            {question: 'Who invented basketball?', answers: ['Michael Jordan', 'James Naismith', 'Phil Jackson', 'Larry Bird'], correctAnswer: 1},
            {question: 'What is a "Technical Foul"?', answers: ['A foul during a shot', 'A foul for unsportsmanlike conduct or rules violations', 'Tripping a player', 'Missing a layup'], correctAnswer: 1},
            {question: 'What starts every basketball game?', answers: ['Free throw', 'Jump ball', 'Throw-in', 'Coin toss'], correctAnswer: 1},
            {question: 'What is "Rebounding"?', answers: ['Passing the ball', 'Catching the ball after a missed shot', 'Shooting from far away', 'Running back on defense'], correctAnswer: 1},
            {question: 'Which position is usually the team\'s best ball-handler?', answers: ['Center', 'Power Forward', 'Point Guard', 'Small Forward'], correctAnswer: 2},
            {question: 'What is a "Backcourt Violation"?', answers: ['Hitting the backboard', 'Bringing the ball back to the defensive half after crossing half-court', 'Stepping out of bounds', 'Shooting from the back'], correctAnswer: 1},
            {question: 'What is "Man-to-Man" defense?', answers: ['Defending a specific zone', 'Each player defends a specific opponent', 'No defense', 'All players defend the ball'], correctAnswer: 1},
            {question: 'What is a "Fadeaway"?', answers: ['A player leaving the game', 'A jump shot taken while leaning backward', 'A fast break', 'A missed pass'], correctAnswer: 1},
            {question: 'How many quarters are in a standard professional game?', answers: ['2', '3', '4', '5'], correctAnswer: 2},
            {question: 'What is the "Key" or "Paint"?', answers: ['The basketball', 'The rectangular area under the basket', 'The sideline', 'The bench area'], correctAnswer: 1}
        ];
    }
    // SPT - Volleyball
    if (strand === 'SPT' && subject === 'Volleyball') {
        return [
            {question: 'How many players are on the court per team?', answers: ['4', '5', '6', '12'], correctAnswer: 2},
            {question: 'What is the maximum number of hits allowed per side?', answers: ['1', '2', '3', '4'], correctAnswer: 2},
            {question: 'What is a "Libero"?', answers: ['The team captain', 'A defensive specialist who wears a different color jersey', 'The head coach', 'A player who only serves'], correctAnswer: 1},
            {question: 'Which skill is used to start a rally?', answers: ['Set', 'Spike', 'Service', 'Block'], correctAnswer: 2},
            {question: 'A "Set" is typically done using which technique?', answers: ['Forearm pass', 'Overhead finger pass', 'Kicking', 'One-handed punch'], correctAnswer: 1},
            {question: 'What is it called when a player jumps and hits the ball forcefully down?', answers: ['Block', 'Set', 'Spike/Attack', 'Dig'], correctAnswer: 2},
            {question: 'In which direction do players rotate on the court?', answers: ['Clockwise', 'Counter-clockwise', 'Randomly', 'They don\'t rotate'], correctAnswer: 0},
            {question: 'Can a player hit the ball twice in a row (excluding blocks)?', answers: ['Yes', 'No', 'Only if they are the captain', 'Only if the ball is high'], correctAnswer: 1},
            {question: 'How many points are needed to win a standard set (must win by 2)?', answers: ['15', '21', '25', '30'], correctAnswer: 2},
            {question: 'What is an "Ace"?', answers: ['A powerful spike', 'A serve that lands directly in court or isn\'t returned', 'A great block', 'A 5-set match'], correctAnswer: 1},
            {question: 'What is a "Dig"?', answers: ['Falling on the floor', 'Preventing the ball from touching the ground after a spike', 'Serving into the net', 'Hitting the ball out'], correctAnswer: 1},
            {question: 'Is the ball "In" if it touches the boundary line?', answers: ['Yes', 'No', 'Only if it\'s the back line', 'Depends on the referee'], correctAnswer: 0},
            {question: 'What is a "Net Foul"?', answers: ['Hitting the ball into the net', 'A player touching the net during play', 'The ball going under the net', 'A loud noise'], correctAnswer: 1},
            {question: 'Which player position is in the front-right during service?', answers: ['Position 1', 'Position 2', 'Position 4', 'Position 6'], correctAnswer: 1},
            {question: 'What is the "Antenna" on the net for?', answers: ['To pick up radio signals', 'To define the vertical crossing space for the ball', 'To hold the net up', 'Decoration'], correctAnswer: 1},
            {question: 'Can you use your feet to hit the ball in volleyball?', answers: ['No, never', 'Yes, it is legal', 'Only in beach volleyball', 'Only the Libero can'], correctAnswer: 1},
            {question: 'What is a "Kill"?', answers: ['An illegal hit', 'An attack that results in an immediate point', 'A broken ball', 'A serve out of bounds'], correctAnswer: 1},
            {question: 'What is a "Block"?', answers: ['Stopping the ball with the forearms', 'Deflecting the ball from the opponent\'s attack at the net', 'Running in front of a player', 'Holding the ball'], correctAnswer: 1},
            {question: 'How many sets must a team win to win a standard match?', answers: ['2 out of 3', '3 out of 5', '1 out of 1', '4 out of 7'], correctAnswer: 1},
            {question: 'What is "Rally Point" scoring?', answers: ['Only the server can score', 'A point is scored on every single rally', 'No points are given for spikes', 'Points only come from blocks'], correctAnswer: 1}
        ];
    }
    // SPT - Badminton
    if (strand === 'SPT' && subject === 'Badminton') {
        return [
            {question: 'What is the "ball" in badminton called?', answers: ['Ball', 'Shuttlecock/Birdie', 'Puck', 'Orbit'], correctAnswer: 1},
            {question: 'A match consists of the best of how many games?', answers: ['1', '3', '5', '7'], correctAnswer: 1},
            {question: 'How many points are needed to win a standard game?', answers: ['11', '15', '21', '25'], correctAnswer: 2},
            {question: 'What is a "Smash"?', answers: ['A gentle drop shot', 'A powerful overhead downward stroke', 'A serve', 'A fault'], correctAnswer: 1},
            {question: 'From which side do you serve when your score is Even (0, 2, 4...)?', answers: ['Left side', 'Right side', 'Center', 'Anywhere'], correctAnswer: 1},
            {question: 'What is it called when the shuttlecock hits the net and stays on the server\'s side?', answers: ['Let', 'Fault', 'Point', 'Re-serve'], correctAnswer: 1},
            {question: 'In doubles, can a player hit the shuttle twice in a row?', answers: ['Yes', 'No', 'Only on serve', 'Only if the partner is far'], correctAnswer: 1},
            {question: 'What is a "Let"?', answers: ['A point for the server', 'A halt in play requiring a replay of the rally', 'A type of racket', 'An out-of-bounds shot'], correctAnswer: 1},
            {question: 'What is a "Drop Shot"?', answers: ['Dropping the racket', 'A shot hit softly to fall just over the net', 'A high long shot', 'A serve into the ground'], correctAnswer: 1},
            {question: 'What is the "Clear" shot?', answers: ['Cleaning the court', 'A high, deep shot to the back of the opponent\'s court', 'A smash', 'A serve'], correctAnswer: 1},
            {question: 'When is a serve considered a fault?', answers: ['If hit below the waist', 'If the shuttle is hit above the waist', 'If it lands in the correct box', 'If it hits the floor'], correctAnswer: 1},
            {question: 'What are the boundaries for a Singles court?', answers: ['Long and Wide', 'Long and Narrow', 'Short and Wide', 'Short and Narrow'], correctAnswer: 1},
            {question: 'What is the "Drive" shot?', answers: ['A high lob', 'A fast, flat shot that passes close over the net', 'A serve', 'A defensive block'], correctAnswer: 1},
            {question: 'What is the height of the badminton net at the center?', answers: ['5 feet', '6 feet', '4 feet', '7 feet'], correctAnswer: 0},
            {question: 'If the score reaches 20-20, how many points lead is needed to win?', answers: ['1', '2', '3', '5'], correctAnswer: 1},
            {question: 'What is the maximum score a game can reach?', answers: ['21', '25', '30', '35'], correctAnswer: 2},
            {question: 'Where must the server stand during a serve?', answers: ['Behind the back line', 'Inside the service court', 'In the middle of the net', 'Outside the side line'], correctAnswer: 1},
            {question: 'Is it a fault if a player\'s racket touches the net?', answers: ['No', 'Yes', 'Only in doubles', 'Only during a smash'], correctAnswer: 1},
            {question: 'What is "Footwork"?', answers: ['Kicking the shuttle', 'The way a player moves around the court', 'The color of the shoes', 'A type of foul'], correctAnswer: 1},
            {question: 'What material are professional shuttlecocks usually made of?', answers: ['Plastic', 'Feathers (Goose or Duck)', 'Paper', 'Rubber'], correctAnswer: 1}
        ];
    }
    // SPT - Table Tennis
    if (strand === 'SPT' && subject === 'Table Tennis') {
        return [
            {question: 'Table Tennis is also commonly known as what?', answers: ['Paddle ball', 'Ping Pong', 'Tennis', 'Net ball'], correctAnswer: 1},
            {question: 'How many points are needed to win a game in modern rules?', answers: ['11', '15', '21', '25'], correctAnswer: 0},
            {question: 'How many serves does each player get before switching?', answers: ['1', '2', '5', '10'], correctAnswer: 1},
            {question: 'What happens if the ball hits the net on a serve but lands in the correct box?', answers: ['Fault', 'Let (Re-serve)', 'Point for receiver', 'Point for server'], correctAnswer: 1},
            {question: 'In doubles, how must the service be delivered?', answers: ['Straight', 'Diagonally from right to right', 'Anywhere', 'From left to left'], correctAnswer: 1},
            {question: 'What is the "Paddle" or "Racket" covered with?', answers: ['Wood only', 'Rubber', 'Plastic', 'Feathers'], correctAnswer: 1},
            {question: 'What is a "Topspin" shot?', answers: ['The ball spinning backward', 'The ball spinning forward/downward', 'A ball with no spin', 'A high lob'], correctAnswer: 1},
            {question: 'A serve must be tossed at least how many inches into the air?', answers: ['2 inches', '6 inches', '12 inches', 'It doesn\'t need a toss'], correctAnswer: 1},
            {question: 'What is a "Deuce"?', answers: ['The start of the game', 'A score of 10-10', 'Winning by two points', 'A type of serve'], correctAnswer: 1},
            {question: 'Which grip is like holding a pen?', answers: ['Shakehand grip', 'Penhold grip', 'Backhand grip', 'Western grip'], correctAnswer: 1},
            {question: 'What is the color of a standard table tennis ball?', answers: ['Yellow or Green', 'White or Orange', 'Red or Blue', 'Black or White'], correctAnswer: 1},
            {question: 'Can you touch the table with your free hand during play?', answers: ['Yes', 'No (it is a fault)', 'Only during a serve', 'Only if you are falling'], correctAnswer: 1},
            {question: 'What is a "Loop" shot?', answers: ['A defensive shot', 'A heavy topspin attacking shot', 'A high serve', 'A mistake'], correctAnswer: 1},
            {question: 'What is a "Chop" in table tennis?', answers: ['A fast smash', 'A defensive backspin shot', 'A side spin serve', 'Hitting the table'], correctAnswer: 1},
            {question: 'What is the standard height of the net?', answers: ['6 inches', '10 inches', '12 inches', '5 feet'], correctAnswer: 0},
            {question: 'If the ball hits the edge of the table (white line), is it in?', answers: ['Yes', 'No', 'Only on serve', 'Only on the side'], correctAnswer: 0},
            {question: 'How many games are usually played in a match?', answers: ['1', 'Best of 5 or 7', 'Best of 2', 'Until someone gets tired'], correctAnswer: 1},
            {question: 'What is "Backspin"?', answers: ['The ball moving faster', 'The ball spinning toward the player who hit it', 'The ball jumping high', 'A serve that goes out'], correctAnswer: 1},
            {question: 'In doubles, players must hit the ball in what order?', answers: ['Randomly', 'Alternating turns', 'Only the captain', 'One player hits all'], correctAnswer: 1},
            {question: 'What is a "Flick" or "Flip"?', answers: ['A long serve', 'A quick wrist motion to attack a short ball', 'Dropping the paddle', 'Running around the table'], correctAnswer: 1}
        ];
    }
    // DEFAULT - kung walang questions available
    return [
        {question: `Sample question for ${subject}. What is the answer?`, answers: ['Option A', 'Option B', 'Option C', 'Option D'], correctAnswer: 0},
        {question: 'This is a placeholder question 2', answers: ['Answer 1', 'Answer 2', 'Answer 3', 'Answer 4'], correctAnswer: 1},
        {question: 'This is a placeholder question 3', answers: ['Choice A', 'Choice B', 'Choice C', 'Choice D'], correctAnswer: 2},
        {question: 'This is a placeholder question 4', answers: ['Option 1', 'Option 2', 'Option 3', 'Option 4'], correctAnswer: 3},
        {question: 'This is a placeholder question 5', answers: ['A', 'B', 'C', 'D'], correctAnswer: 0},
        {question: 'This is a placeholder question 6', answers: ['First', 'Second', 'Third', 'Fourth'], correctAnswer: 1},
        {question: 'This is a placeholder question 7', answers: ['One', 'Two', 'Three', 'Four'], correctAnswer: 2},
        {question: 'This is a placeholder question 8', answers: ['Alpha', 'Beta', 'Gamma', 'Delta'], correctAnswer: 3},
        {question: 'This is a placeholder question 9', answers: ['Red', 'Blue', 'Green', 'Yellow'], correctAnswer: 0},
        {question: 'This is a placeholder question 10', answers: ['North', 'South', 'East', 'West'], correctAnswer: 1},
        {question: 'This is a placeholder question 11', answers: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], correctAnswer: 2},
        {question: 'This is a placeholder question 12', answers: ['Spring', 'Summer', 'Fall', 'Winter'], correctAnswer: 3},
        {question: 'This is a placeholder question 13', answers: ['Apple', 'Banana', 'Orange', 'Grape'], correctAnswer: 0},
        {question: 'This is a placeholder question 14', answers: ['Dog', 'Cat', 'Bird', 'Fish'], correctAnswer: 1},
        {question: 'This is a placeholder question 15', answers: ['Car', 'Bike', 'Bus', 'Train'], correctAnswer: 2},
        {question: 'This is a placeholder question 16', answers: ['Book', 'Pen', 'Paper', 'Ruler'], correctAnswer: 3},
        {question: 'This is a placeholder question 17', answers: ['Circle', 'Square', 'Triangle', 'Rectangle'], correctAnswer: 0},
        {question: 'This is a placeholder question 18', answers: ['Pizza', 'Burger', 'Pasta', 'Rice'], correctAnswer: 1},
        {question: 'This is a placeholder question 19', answers: ['Water', 'Juice', 'Soda', 'Coffee'], correctAnswer: 2},
        {question: 'This is a placeholder question 20', answers: ['Happy', 'Sad', 'Angry', 'Excited'], correctAnswer: 3}
    ];
}

// pampakita ng tanong
function displayQuestion() {
    const question = quizQuestions[currentQuestionIndex];
    
    document.getElementById('currentQuestion').textContent = currentQuestionIndex + 1;
    document.getElementById('questionText').textContent = question.question;
    
    const answersContainer = document.getElementById('answersContainer');
    answersContainer.innerHTML = '';
    
    // action listener sa buttons sa mga sagot pag pinindot
    question.answers.forEach((answer, index) => {
        const answerBtn = document.createElement('div');
        answerBtn.className = 'answer-option';
        answerBtn.textContent = answer;
        answerBtn.onclick = () => selectAnswer(index);
        answersContainer.appendChild(answerBtn);
    });
    
    // pag wala selected tapos i try i skip pigilan
    document.getElementById('nextBtn').disabled = true;
}

// action listener pag pinili sagot
function selectAnswer(answerIndex) {
    // pag naka select ignore iba
    const allAnswers = document.querySelectorAll('.answer-option');
    allAnswers.forEach(ans => ans.classList.remove('selected'));
    
    // lagyan ng status ang pinili 
    allAnswers[answerIndex].classList.add('selected');
    
    // i save ang sagot parang data
    userAnswers[currentQuestionIndex] = answerIndex;
    
    // pang next
    document.getElementById('nextBtn').disabled = false;
}

// sunod na tanong pagkatapos ng isa sa mga tanong
function nextQuestion() {
    const currentQuestion = quizQuestions[currentQuestionIndex];
    const userAnswer = userAnswers[currentQuestionIndex];
    const isCorrect = userAnswer === currentQuestion.correctAnswer;
    
    // pang check kung tama
    if (isCorrect) {
        score++;
        // kung tama sa review mode, tanggalin sa wrong answers list
        if (currentMode === 'Review') {
            removeWrongAnswer(currentStrand, currentSubject, currentQuestion);
        }
    } else {
        // kung mali at Practice mode, i-save sa wrong answers list (para sa review later)
        // NOTE: Start Quiz mode does NOT save wrong answers
        if (currentMode === 'Practice') {
            saveWrongAnswer(currentStrand, currentSubject, currentQuestion);
        }
    }
    
    currentQuestionIndex++;
    
    // tignan kung tapos na real time
    if (currentQuestionIndex >= quizQuestions.length) {
        finishQuiz();
    } else {
        displayQuestion();
    }
}

// pag tapos ang quiz pigilan timer
function finishQuiz() {
    stopTimer();
    
    const totalQuestions = quizQuestions.length;
    
    // labas mga resulta
    document.getElementById('finalScore').textContent = score;
    document.getElementById('totalScore').textContent = totalQuestions;
    document.getElementById('scorePercentage').textContent = `${Math.round((score / totalQuestions) * 100)}%`;
    document.getElementById('resultStrand').textContent = currentStrand;
    document.getElementById('resultSubject').textContent = currentSubject;
    document.getElementById('resultMode').textContent = currentMode;
    document.getElementById('resultTime').textContent = formatTime(elapsedTime);

    persistQuizResult(totalQuestions);
    
    hideAllPages();
    document.getElementById('resultsPage').classList.remove('hidden');
}

// pang ulit ng quiz pag gusto ulitin (with new randomization)
function retakeQuiz() {
    if (currentStrand && String(currentStrand).indexOf('AI-') === 0 && aiLastGenerated) {
        launchAiQuiz(aiLastGenerated, currentMode);
        return;
    }
    startQuiz(currentMode);
}

// ginagawa ng timer or habang buong quiz
function startTimer() {
    startTime = Date.now();
    elapsedTime = 0;
    
    timerInterval = setInterval(() => {
        elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        document.getElementById('timer').textContent = formatTime(elapsedTime);
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function persistQuizResult(totalQuestions) {
    if (typeof DB === 'undefined' || !currentUser) {
        return;
    }

    try {
        await DB.submitQuiz({
            strand: currentStrand,
            subject: currentSubject,
            mode: currentMode,
            score: score,
            totalQuestions: totalQuestions,
            timeTaken: elapsedTime,
        });

        notify('Quiz result saved successfully.', 'success');
    } catch (err) {
        notify((err && err.message) || 'Failed to save quiz result.', 'error');
    }
}

function notify(message, type) {
    if (typeof showToast === 'function') {
        showToast(message, type || 'info');
        return;
    }
    alert(message);
}
