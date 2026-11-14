/**
 * ClassPoll Live - Lógica Principal de la Aplicación
 * Sincronización en tiempo real con Socket.io, almacenamiento local y renderizado dinámico.
 */

// ==========================================
// 1. CONFIGURACIÓN CENTRALIZADA (CONFIG)
// ==========================================
const CONFIG = Object.freeze({
    STORAGE_KEYS: {
        SURVEY: 'classpoll_survey_v4',
        SUBMISSIONS: 'classpoll_submissions_v4',
        STUDENT: 'classpoll_current_student_v4'
    },
    TEACHER_PIN: '1234',
    DEFAULT_QUESTIONS_PER_BLOCK: 2,
    SYNC_CHANNEL: 'classpoll_live_sync'
});

// ==========================================
// 2. ENCUESTA POR DEFECTO (DEFAULT_SURVEY)
// ==========================================
const DEFAULT_SURVEY = {
    title: "Conceptos Fundamentales de Física y Termodinámica",
    activeBlock: 0,
    questionsPerBlock: CONFIG.DEFAULT_QUESTIONS_PER_BLOCK,
    questions: [
        {
            id: "q1",
            text: "Se abre una válvula permitiendo que un gas ideal se expanda libremente hacia un recipiente al vacío adyacente que está aislado térmicamente. Durante esta expansión libre, ¿qué ocurre con la temperatura del gas?",
            type: "multiple",
            options: [
                "1) Aumenta.",
                "2) Disminuye.",
                "3) Permanece igual."
            ],
            correctAnswer: "3) Permanece igual.",
            explanation: "Al expandirse hacia el vacío no hay fuerza opositora (W = 0). Al estar aislado térmicamente (Q = 0). Por la Primera Ley (ΔU = Q - W = 0). En un gas ideal, U depende únicamente de T, por lo que ΔT = 0."
        },
        {
            id: "q2",
            text: "Nivel de certeza de su respuesta:",
            type: "multiple",
            options: [
                "Total incertidumbre",
                "Baja certeza",
                "Certeza media",
                "Certeza alta",
                "Total certeza"
            ],
            correctAnswer: null,
            explanation: null
        },
        {
            id: "q3",
            text: "Un gas realiza un ciclo termodinámico cerrado en un diagrama P-V compuesto por una expansión a alta presión seguida de una compresión a baja presión (sentido horario). ¿Cuál es el signo del trabajo neto realizado por el gas?",
            type: "multiple",
            options: [
                "1) Positivo.",
                "2) Negativo.",
                "3) Cero."
            ],
            correctAnswer: "1) Positivo.",
            explanation: "El trabajo es el área bajo la curva. La expansión a alta presión aporta trabajo positivo mayor que el trabajo negativo de la compresión a baja presión. El área encerrada en sentido horario representa un trabajo neto positivo."
        },
        {
            id: "q4",
            text: "Nivel de certeza de su respuesta:",
            type: "multiple",
            options: [
                "Total incertidumbre",
                "Baja certeza",
                "Certeza media",
                "Certeza alta",
                "Total certeza"
            ],
            correctAnswer: null,
            explanation: null
        }
    ]
};

// ==========================================
// 3. ESTADO GLOBAL DE LA APLICACIÓN (STATE)
// ==========================================
/**
 * Garantiza que la estructura de la encuesta mantenga sus respuestas correctas y explicaciones teóricas.
 * @param {Object} survey - Objeto de datos de la encuesta.
 * @returns {Object} Encuesta enriquecida con metadatos.
 */
function enrichSurveyWithMetadata(survey) {
    if (!survey || !survey.questions) return survey;
    survey.questions.forEach((q, idx) => {
        const defaultQ = DEFAULT_SURVEY.questions[idx];
        if (defaultQ) {
            if (!q.correctAnswer && defaultQ.correctAnswer) {
                q.correctAnswer = defaultQ.correctAnswer;
            }
            if (!q.explanation && defaultQ.explanation) {
                q.explanation = defaultQ.explanation;
            }
        }
    });
    return survey;
}

const state = {
    survey: enrichSurveyWithMetadata(JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SURVEY)) || DEFAULT_SURVEY),
    submissions: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SUBMISSIONS)) || [],
    activeStudents: [],
    currentStudent: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.STUDENT)) || null,
    currentRole: 'student',
    isTeacherAuthenticated: false,
    revealedAnswers: {},
    chartInstances: {}
};

// ==========================================
// 4. FUNCIONES DE UTILIDAD (SURVEY UTILS)
// ==========================================
const SurveyUtils = {
    getQuestionsPerBlock: () => state.survey.questionsPerBlock || CONFIG.DEFAULT_QUESTIONS_PER_BLOCK,
    
    getTotalBlocks: () => {
        const qpb = SurveyUtils.getQuestionsPerBlock();
        return Math.ceil(state.survey.questions.length / qpb) || 1;
    },

    getCurrentBlockQuestions: () => {
        const qpb = SurveyUtils.getQuestionsPerBlock();
        const start = state.survey.activeBlock * qpb;
        return state.survey.questions.slice(start, start + qpb);
    }
};

// ==========================================
// 5. RED Y PERSISTENCIA (SOCKET & STORAGE)
// ==========================================
let socket = null;
const pollChannel = new BroadcastChannel(CONFIG.SYNC_CHANNEL);

function initSocketConnection() {
    try {
        if (typeof io !== 'undefined' && !socket) {
            socket = io({
                transports: ['polling', 'websocket'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000
            });

            socket.on('connect', () => {
                const badge = document.getElementById('sessionStatusBadge');
                if (badge) {
                    badge.textContent = "Conectado en vivo";
                    badge.className = "text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
                }
                if (state.currentStudent && state.currentStudent.id) {
                    socket.emit('student_joined', state.currentStudent);
                }
            });

            socket.on('init_state', (data) => {
                if (data) {
                    if (data.surveyData) state.survey = enrichSurveyWithMetadata(data.surveyData);
                    if (data.submissions && data.submissions.length > 0) state.submissions = data.submissions;
                    if (data.activeStudents) state.activeStudents = data.activeStudents;
                    renderApp();
                }
            });

            socket.on('poll_state_updated', (data) => {
                if (data) {
                    if (data.surveyData) state.survey = enrichSurveyWithMetadata(data.surveyData);
                    if (data.submissions) state.submissions = data.submissions;
                    if (data.activeStudents) state.activeStudents = data.activeStudents;
                    renderApp();
                }
            });
        }
    } catch (e) {
        console.warn("Modo local/standalone activado:", e);
    }
}

function saveStateToStorage(isTeacherAction = false) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SURVEY, JSON.stringify(state.survey));
    localStorage.setItem(CONFIG.STORAGE_KEYS.SUBMISSIONS, JSON.stringify(state.submissions));
    localStorage.setItem(CONFIG.STORAGE_KEYS.STUDENT, JSON.stringify(state.currentStudent));
    
    pollChannel.postMessage({ type: 'SYNC' });

    if (socket) {
        if (isTeacherAction) {
            socket.emit('update_poll_state', { surveyData: state.survey, submissions: state.submissions });
        } else {
            socket.emit('update_poll_state', { submissions: state.submissions });
        }
    }
}

// Inicialización de Socket y escucha entre pestañas
initSocketConnection();

pollChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'SYNC') {
        state.survey = enrichSurveyWithMetadata(JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SURVEY)) || DEFAULT_SURVEY);
        state.submissions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SUBMISSIONS)) || [];
        renderApp();
    }
};

window.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    initSocketConnection();
    switchRole('student');
});

// ==========================================
// 6. SEGURIDAD Y ROL DOCENTE
// ==========================================
let pendingTeacherAction = null;

function trySwitchToTeacher() {
    if (state.isTeacherAuthenticated) {
        switchRole('teacher');
    } else {
        pendingTeacherAction = () => switchRole('teacher');
        const pinInput = document.getElementById('inputPin');
        const modal = document.getElementById('pinModal');
        if (pinInput) pinInput.value = '';
        if (modal) modal.classList.remove('hidden');
        setTimeout(() => pinInput && pinInput.focus(), 100);
    }
}

function protectedAction(actionCallback) {
    if (state.isTeacherAuthenticated) {
        actionCallback();
    } else {
        pendingTeacherAction = actionCallback;
        const pinInput = document.getElementById('inputPin');
        const modal = document.getElementById('pinModal');
        if (pinInput) pinInput.value = '';
        if (modal) modal.classList.remove('hidden');
    }
}

function verifyPin(e) {
    if (e) e.preventDefault();
    const pinVal = document.getElementById('inputPin') ? document.getElementById('inputPin').value : '';
    if (pinVal === CONFIG.TEACHER_PIN) {
        state.isTeacherAuthenticated = true;
        closePinModal();
        showToast("Autenticación docente correcta", "success");
        if (pendingTeacherAction) {
            const action = pendingTeacherAction;
            pendingTeacherAction = null;
            action();
        } else {
            switchRole('teacher');
        }
    } else {
        showToast("PIN incorrecto. Intenta de nuevo.", "warning");
    }
}

function closePinModal() {
    const modal = document.getElementById('pinModal');
    if (modal) modal.classList.add('hidden');
    pendingTeacherAction = null;
}

function switchRole(role) {
    if (role === 'teacher' && !state.isTeacherAuthenticated) {
        trySwitchToTeacher();
        return;
    }

    state.currentRole = role;
    const btnTeacher = document.getElementById('btnRoleTeacher');
    const btnStudent = document.getElementById('btnRoleStudent');
    const teacherView = document.getElementById('teacherView');
    const studentView = document.getElementById('studentView');

    if (role === 'teacher') {
        if (btnTeacher) btnTeacher.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-white bg-indigo-600 shadow-md";
        if (btnStudent) btnStudent.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-slate-400 hover:text-white";
        if (teacherView) teacherView.classList.remove('hidden');
        if (studentView) studentView.classList.add('hidden');
    } else {
        if (btnStudent) btnStudent.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-white bg-indigo-600 shadow-md";
        if (btnTeacher) btnTeacher.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-slate-400 hover:text-white";
        if (studentView) studentView.classList.remove('hidden');
        if (teacherView) teacherView.classList.add('hidden');
    }
    renderApp();
}

// ==========================================
// 7. MOTOR DE RENDERIZADO
// ==========================================
function renderApp() {
    if (state.currentRole === 'teacher') {
        renderTeacherDashboard();
    } else {
        renderStudentView();
    }
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function renderTeacherDashboard() {
    const titleElem = document.getElementById('teacherSessionTitle');
    if (titleElem) titleElem.textContent = state.survey.title;

    const totalCountElem = document.getElementById('totalQuestionsCount');
    if (totalCountElem) totalCountElem.textContent = `${state.survey.questions.length} preguntas en total`;

    const activeCount = state.activeStudents ? state.activeStudents.length : 0;
    const teacherSubElem = document.getElementById('teacherTotalSubmissions');
    if (teacherSubElem) teacherSubElem.textContent = `${activeCount} en línea (${state.submissions.length} con respuestas)`;

    const qpb = SurveyUtils.getQuestionsPerBlock();
    const totalBlocks = SurveyUtils.getTotalBlocks();
    const currentBlockIdx = state.survey.activeBlock;

    const selectElem = document.getElementById('selectQuestionsPerBlock');
    if (selectElem) selectElem.value = qpb;

    const badgeElem = document.getElementById('activeBlockBadge');
    if (badgeElem) badgeElem.textContent = `Bloque ${currentBlockIdx + 1} Activo`;

    const progressTextElem = document.getElementById('blockProgressText');
    if (progressTextElem) progressTextElem.textContent = `Bloque ${currentBlockIdx + 1} de ${totalBlocks}`;

    const progressPct = ((currentBlockIdx + 1) / totalBlocks) * 100;
    const progressBarElem = document.getElementById('blockProgressBar');
    if (progressBarElem) progressBarElem.style.width = `${progressPct}%`;

    const btnPrev = document.getElementById('btnPrevBlock');
    const btnNext = document.getElementById('btnNextBlock');
    if (btnPrev) btnPrev.disabled = currentBlockIdx === 0;
    if (btnNext) btnNext.disabled = currentBlockIdx >= totalBlocks - 1;

    renderBlockCharts();
    renderParticipantsTable();
}

function updateQuestionsPerBlock(val) {
    const newQpb = parseInt(val, 10);
    if (newQpb >= 1 && newQpb <= 10) {
        state.survey.questionsPerBlock = newQpb;
        state.survey.activeBlock = 0;
        saveStateToStorage(true);
        renderApp();
        showToast(`Configurado a ${newQpb} pregunta(s) por bloque`, "info");
    }
}

function changeActiveBlock(delta) {
    const totalBlocks = SurveyUtils.getTotalBlocks();
    const newBlock = state.survey.activeBlock + delta;

    if (newBlock >= 0 && newBlock < totalBlocks) {
        state.survey.activeBlock = newBlock;
        saveStateToStorage(true);
        renderApp();
        showToast(`Bloque ${newBlock + 1} activado para los estudiantes`, "info");
    }
}

function toggleAnswerVisibility(qId) {
    state.revealedAnswers[qId] = !state.revealedAnswers[qId];
    renderBlockCharts();
}

function renderBlockCharts() {
    const container = document.getElementById('chartsContainer');
    if (!container) return;
    container.innerHTML = '';

    const qpb = SurveyUtils.getQuestionsPerBlock();
    const startIndex = state.survey.activeBlock * qpb;
    const blockQuestions = SurveyUtils.getCurrentBlockQuestions();

    blockQuestions.forEach((q, idx) => {
        const questionNumber = startIndex + idx + 1;
        const isRevealed = !!state.revealedAnswers[q.id];

        const toggleBtnHTML = q.correctAnswer ? `
            <button onclick="toggleAnswerVisibility('${q.id}')" class="px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all ${isRevealed ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'}">
                <i data-lucide="${isRevealed ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
                <span>${isRevealed ? 'Ocultar Respuesta' : 'Mostrar Respuesta'}</span>
            </button>
        ` : '';

        const correctAnswerHTML = q.correctAnswer ? `
            <div id="answer_box_${q.id}" class="${isRevealed ? '' : 'hidden'} mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs space-y-1 transition-all">
                <div class="font-bold text-emerald-400 flex items-center gap-1.5">
                    <i data-lucide="check-circle-2" class="w-4 h-4"></i> Respuesta Correcta: ${q.correctAnswer}
                </div>
                ${q.explanation ? `<p class="text-slate-300 italic text-[11px] leading-relaxed mt-1">${q.explanation}</p>` : ''}
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = "bg-slate-900/60 border border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xl";

        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between text-xs text-indigo-400 font-semibold mb-2">
                    <span class="bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">Pregunta ${questionNumber}</span>
                    ${toggleBtnHTML}
                </div>
                <h4 class="font-bold text-white text-sm leading-snug">${q.text}</h4>
                ${correctAnswerHTML}
            </div>
            <div class="relative h-56 w-full">
                <canvas id="chart_q_${q.id}"></canvas>
            </div>
        `;

        container.appendChild(card);

        setTimeout(() => {
            createOrUpdateChart(q);
        }, 50);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function createOrUpdateChart(question) {
    const canvas = document.getElementById(`chart_q_${question.id}`);
    if (!canvas) return;

    const counts = question.options.map(() => 0);
    state.submissions.forEach(sub => {
        const answer = sub.answers ? sub.answers[question.id] : null;
        if (answer) {
            const optIndex = question.options.indexOf(answer);
            if (optIndex !== -1) counts[optIndex]++;
        }
    });

    if (state.chartInstances[question.id]) {
        state.chartInstances[question.id].destroy();
    }

    const isRevealed = !!state.revealedAnswers[question.id];

    const bgColors = question.options.map(opt => 
        (isRevealed && opt === question.correctAnswer) ? 'rgba(16, 185, 129, 0.85)' : 'rgba(99, 102, 241, 0.65)'
    );
    const borderColors = question.options.map(opt => 
        (isRevealed && opt === question.correctAnswer) ? 'rgba(16, 185, 129, 1)' : 'rgba(99, 102, 241, 1)'
    );

    const ctx = canvas.getContext('2d');
    state.chartInstances[question.id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: question.options.map(opt => opt.length > 25 ? opt.substring(0, 25) + '...' : opt),
            datasets: [{
                label: 'Respuestas',
                data: counts,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, color: '#94a3b8' },
                    grid: { color: 'rgba(51, 65, 85, 0.5)' }
                },
                x: {
                    ticks: { color: '#94a3b8', font: { size: 10 } },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderParticipantsTable() {
    const tbody = document.getElementById('participantsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const countBadge = document.getElementById('logCountBadge');
    if (countBadge) countBadge.textContent = `${state.submissions.length} participantes registrados`;

    if (state.submissions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500 italic">No hay datos registrados aún.</td></tr>`;
        return;
    }

    state.submissions.forEach(sub => {
        const answeredCount = Object.keys(sub.answers || {}).length;
        const totalCount = state.survey.questions.length;
        const formattedDate = new Date(sub.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/50 transition-colors";
        tr.innerHTML = `
            <td class="py-3 px-4 font-semibold text-white">${sub.studentName}</td>
            <td class="py-3 px-4"><span class="bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded font-mono">${answeredCount} / ${totalCount}</span></td>
            <td class="py-3 px-4 text-slate-400">${formattedDate}</td>
            <td class="py-3 px-4 text-right">
                <span class="px-2 py-0.5 rounded-full ${answeredCount >= totalCount ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'} font-medium">
                    ${answeredCount >= totalCount ? 'Completo' : 'En Progreso'}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 8. VISTA ESTUDIANTE Y FORMULARIOS
// ==========================================
export function renderStudentView() {
    const loginCard = document.getElementById('studentLoginCard');
    const formCard = document.getElementById('studentFormCard');
    const completedScreen = document.getElementById('studentCompletedScreen');

    // 1. Si no hay estudiante logueado, mostrar tarjeta de login
    if (!state.currentStudent) {
        if (loginCard) loginCard.classList.remove('hidden');
        if (formCard) formCard.classList.add('hidden');
        if (completedScreen) completedScreen.classList.add('hidden');
        return;
    }

    if (loginCard) loginCard.classList.add('hidden');

    // 2. Calcular progreso total del estudiante
    const totalQuestions = state.survey.questions ? state.survey.questions.length : 0;
    const studentSub = state.submissions.find(s => s.studentId === state.currentStudent.id);
    const answeredCount = (studentSub && studentSub.answers) ? Object.keys(studentSub.answers).length : 0;

    const isFullyCompleted = totalQuestions > 0 && answeredCount >= totalQuestions;

    // 3. Evaluar si debe desplegar la Pantalla Final de Cierre
    if (isFullyCompleted) {
        if (formCard) formCard.classList.add('hidden');
        if (completedScreen) completedScreen.classList.remove('hidden');
        return;
    }

    // 4. Si aún no ha completado todas las preguntas, mostrar la vista por bloques habitual
    if (completedScreen) completedScreen.classList.add('hidden');
    if (formCard) formCard.classList.remove('hidden');

    const displayName = document.getElementById('studentDisplayName');
    if (displayName) displayName.textContent = state.currentStudent.name;

    const qpb = SurveyUtils.getQuestionsPerBlock();
    const activeBlockIdx = state.survey.activeBlock;
    const startIndex = activeBlockIdx * qpb;
    const blockQuestions = SurveyUtils.getCurrentBlockQuestions();

    const blockBadge = document.getElementById('studentBlockBadge');
    if (blockBadge) {
        blockBadge.textContent = `Bloque ${activeBlockIdx + 1} (Preguntas ${startIndex + 1} y ${startIndex + blockQuestions.length})`;
    }

    const hasAnsweredBlock = blockQuestions.length > 0 && blockQuestions.every(q => studentSub && studentSub.answers && studentSub.answers[q.id]);

    const waitingBanner = document.getElementById('waitingBlockBanner');
    const studentForm = document.getElementById('studentBlockForm');

    if (hasAnsweredBlock) {
        if (waitingBanner) waitingBanner.classList.remove('hidden');
        if (studentForm) studentForm.classList.add('hidden');
    } else {
        if (waitingBanner) waitingBanner.classList.add('hidden');
        if (studentForm) studentForm.classList.remove('hidden');
        renderStudentQuestions(blockQuestions, studentSub);
    }
}


function renderStudentQuestions(questions, studentSub) {
    const container = document.getElementById('studentQuestionsContainer');
    if (!container) return;
    container.innerHTML = '';

    questions.forEach((q) => {
        const qCard = document.createElement('div');
        qCard.className = "bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4";

        let optionsHTML = q.options.map((opt, oIdx) => {
            const currentAns = studentSub && studentSub.answers ? studentSub.answers[q.id] : null;
            const isChecked = currentAns === opt ? 'checked' : '';

            return `
                <label class="flex items-center gap-3 p-3.5 bg-slate-900/60 border border-slate-700/80 rounded-xl cursor-pointer hover:border-indigo-500/50 transition-all">
                    <input type="radio" name="question_${q.id}" value="${opt}" ${isChecked} required class="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-800">
                    <span class="text-xs text-slate-400 font-mono font-bold">${String.fromCharCode(65 + oIdx)})</span>
                    <span class="text-sm text-slate-200">${opt}</span>
                </label>
            `;
        }).join('');

        qCard.innerHTML = `
            <div class="space-y-1">
                <span class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Pregunta #${state.survey.questions.indexOf(q) + 1}</span>
                <h3 class="text-base font-bold text-white leading-snug">${q.text}</h3>
            </div>
            <div class="space-y-2.5">
                ${optionsHTML}
            </div>
        `;
        container.appendChild(qCard);
    });
}

function handleStudentLogin(e) {
    e.preventDefault();
    const nameInput = document.getElementById('inputStudentName');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    if (name) {
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
        state.currentStudent = { name, id };
        localStorage.setItem(CONFIG.STORAGE_KEYS.STUDENT, JSON.stringify(state.currentStudent));

        if (socket) {
            socket.emit('student_joined', state.currentStudent);
        }

        renderApp();
        showToast(`Bienvenido, ${name}`, "success");
    }
}

function studentLogout() {
    state.currentStudent = null;
    localStorage.removeItem(CONFIG.STORAGE_KEYS.STUDENT);
    renderApp();
    showToast("Sesión cerrada correctamente", "info");
}

function handleStudentSubmitBlock(e) {
    e.preventDefault();
    if (!state.currentStudent) return;

    let subIndex = state.submissions.findIndex(s => s.studentId === state.currentStudent.id);
    if (subIndex === -1) {
        state.submissions.push({
            studentName: state.currentStudent.name,
            studentId: state.currentStudent.id,
            timestamp: new Date().toISOString(),
            answers: {}
        });
        subIndex = state.submissions.length - 1;
    }

    const blockQuestions = SurveyUtils.getCurrentBlockQuestions();

    blockQuestions.forEach(q => {
        const selected = document.querySelector(`input[name="question_${q.id}"]:checked`);
        if (selected) {
            state.submissions[subIndex].answers[q.id] = selected.value;
        }
    });

    state.submissions[subIndex].timestamp = new Date().toISOString();

    saveStateToStorage(false);
    renderApp();
    showToast("Respuestas enviadas y sincronizadas con el profesor", "success");
}

// ==========================================
// 9. EXPORTACIÓN E IMPORTACIÓN (CSV & JSON)
// ==========================================
function exportToCSV() {
    if (state.submissions.length === 0) {
        showToast("No hay datos cargados para exportar", "warning");
        return;
    }

    let headers = ["Nombre_Estudiante"];
    state.survey.questions.forEach((q, idx) => {
        headers.push(`P${idx + 1}_Respuesta`);
        headers.push(`P${idx + 1}_Correcta`);
    });

    let csvRows = [headers.join(",")];

    state.submissions.forEach(sub => {
        let row = [
            `"${sub.studentName.replace(/"/g, '""')}"`
        ];

        state.survey.questions.forEach(q => {
            const answerText = sub.answers ? sub.answers[q.id] : null;
            if (answerText) {
                const optCode = q.options.indexOf(answerText) + 1;
                row.push(optCode > 0 ? optCode : 0);
            } else {
                row.push(0);
            }

            if (q.correctAnswer) {
                const correctCode = q.options.indexOf(q.correctAnswer) + 1;
                row.push(correctCode > 0 ? correctCode : 0);
            } else {
                row.push(0);
            }
        });

        csvRows.push(row.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Respuestas_Encuesta_Codificadas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("CSV codificado descargado con éxito", "success");
}

function exportSurveyJSON() {
    if (!state.survey || !state.survey.questions) {
        showToast("No hay encuesta válida para exportar", "warning");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.survey, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Encuesta_${(state.survey.title || 'cuestionario').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast("Estructura de la encuesta descargada en formato JSON", "success");
}

function triggerImportJSON() {
    const fileInput = document.getElementById('importJsonInput');
    if (fileInput) fileInput.click();
}

function importSurveyJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsedData = JSON.parse(e.target.result);
            if (parsedData && Array.isArray(parsedData.questions) && parsedData.questions.length >= 2) {
                state.survey = parsedData;
                if (typeof state.survey.activeBlock !== 'number') {
                    state.survey.activeBlock = 0;
                }
                
                saveStateToStorage(true);
                renderApp();
                showToast("Encuesta cargada exitosamente y publicada a los estudiantes", "success");
            } else {
                showToast("El archivo JSON debe contener al menos 2 preguntas válidas.", "warning");
            }
        } catch (err) {
            showToast("Error al procesar el archivo JSON. Verifique el formato.", "warning");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ==========================================
// 10. EDITOR AVANZADO DE ENCUESTAS
// ==========================================
function openEditSurveyModal() {
    protectedAction(() => {
        const titleElem = document.getElementById('editSessionTitle');
        if (titleElem) titleElem.value = state.survey.title;
        renderQuestionsEditor();
        const modal = document.getElementById('editSurveyModal');
        if (modal) modal.classList.remove('hidden');
    });
}

function closeEditSurveyModal() {
    const modal = document.getElementById('editSurveyModal');
    if (modal) modal.classList.add('hidden');
}

function syncEditorStateToData() {
    state.survey.questions.forEach((q, qIdx) => {
        const textElem = document.getElementById(`edit_q_text_${qIdx}`);
        if (textElem) q.text = textElem.value;

        const updatedOptions = [];
        let oIdx = 0;
        while (true) {
            const optElem = document.getElementById(`edit_q_opt_${qIdx}_${oIdx}`);
            if (!optElem) break;
            updatedOptions.push(optElem.value);
            oIdx++;
        }
        if (updatedOptions.length > 0) {
            q.options = updatedOptions;
        }

        const correctElem = document.getElementById(`edit_q_correct_${qIdx}`);
        if (correctElem) q.correctAnswer = correctElem.value || null;

        const expElem = document.getElementById(`edit_q_explanation_${qIdx}`);
        if (expElem) q.explanation = expElem.value || null;
    });
}

function renderQuestionsEditor() {
    const container = document.getElementById('questionsEditorContainer');
    if (!container) return;
    container.innerHTML = '';

    state.survey.questions.forEach((q, qIdx) => {
        const qDiv = document.createElement('div');
        qDiv.className = "bg-slate-900 border border-slate-700/80 rounded-xl p-5 space-y-4 shadow-md";

        let optionsHTML = q.options.map((opt, oIdx) => `
            <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-bold text-slate-400 w-5">${String.fromCharCode(65 + oIdx)})</span>
                <input type="text" value="${opt.replace(/"/g, '&quot;')}" id="edit_q_opt_${qIdx}_${oIdx}" class="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500">
                <button type="button" onclick="removeOptionField(${qIdx}, ${oIdx})" class="text-xs text-red-400 hover:text-red-300 p-1" title="Eliminar opción">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `).join('');

        let correctOptionsHTML = `<option value="">-- Sin respuesta correcta (ej. Escala de Certeza) --</option>`;
        q.options.forEach((opt) => {
            const isSel = (q.correctAnswer === opt) ? 'selected' : '';
            correctOptionsHTML += `<option value="${opt.replace(/"/g, '&quot;')}" ${isSel}>${opt}</option>`;
        });

        qDiv.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                <span class="text-xs font-bold text-indigo-400 uppercase tracking-wider">Pregunta #${qIdx + 1}</span>
                <button type="button" onclick="removeQuestionField(${qIdx})" class="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-medium">
                    <i data-lucide="trash" class="w-3.5 h-3.5"></i> Eliminar Pregunta
                </button>
            </div>

            <div>
                <label class="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Enunciado de la Pregunta</label>
                <input type="text" value="${q.text.replace(/"/g, '&quot;')}" id="edit_q_text_${qIdx}" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500">
            </div>

            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <label class="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Opciones de Respuesta</label>
                    <button type="button" onclick="addOptionField(${qIdx})" class="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1">
                        <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Añadir Opción
                    </button>
                </div>
                <div class="space-y-2">
                    ${optionsHTML}
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                    <label class="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Respuesta Correcta</label>
                    <select id="edit_q_correct_${qIdx}" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500">
                        ${correctOptionsHTML}
                    </select>
                </div>

                <div>
                    <label class="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Retroalimentación / Explicación</label>
                    <textarea id="edit_q_explanation_${qIdx}" rows="2" placeholder="Justificación teórica o retroalimentación..." class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500">${q.explanation || ''}</textarea>
                </div>
            </div>
        `;
        container.appendChild(qDiv);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function addOptionField(qIdx) {
    syncEditorStateToData();
    if (state.survey.questions[qIdx]) {
        const num = state.survey.questions[qIdx].options.length + 1;
        state.survey.questions[qIdx].options.push(`Opción ${num}`);
        renderQuestionsEditor();
    }
}

function removeOptionField(qIdx, oIdx) {
    syncEditorStateToData();
    if (state.survey.questions[qIdx] && state.survey.questions[qIdx].options.length > 2) {
        state.survey.questions[qIdx].options.splice(oIdx, 1);
        renderQuestionsEditor();
    } else {
        showToast("Cada pregunta debe tener al menos 2 opciones.", "warning");
    }
}

function addNewQuestionField() {
    syncEditorStateToData();
    state.survey.questions.push({
        id: `q_${Date.now()}`,
        text: "Nueva pregunta de prueba",
        type: "multiple",
        options: ["1) Opción A", "2) Opción B", "3) Opción C"],
        correctAnswer: null,
        explanation: null
    });
    renderQuestionsEditor();
}

function removeQuestionField(idx) {
    syncEditorStateToData();
    if (state.survey.questions.length <= 2) {
        showToast("Se requieren al menos 2 preguntas para la estructura de bloques.", "warning");
        return;
    }
    state.survey.questions.splice(idx, 1);
    renderQuestionsEditor();
}

function saveSurveyChanges() {
    const titleElem = document.getElementById('editSessionTitle');
    if (titleElem && titleElem.value.trim()) {
        state.survey.title = titleElem.value.trim();
    }

    state.survey.questions.forEach((q, qIdx) => {
        const textElem = document.getElementById(`edit_q_text_${qIdx}`);
        if (textElem && textElem.value.trim()) {
            q.text = textElem.value.trim();
        }

        const updatedOptions = [];
        let oIdx = 0;
        while (true) {
            const optElem = document.getElementById(`edit_q_opt_${qIdx}_${oIdx}`);
            if (!optElem) break;
            if (optElem.value.trim()) {
                updatedOptions.push(optElem.value.trim());
            }
            oIdx++;
        }
        if (updatedOptions.length >= 2) {
            q.options = updatedOptions;
        }

        const correctElem = document.getElementById(`edit_q_correct_${qIdx}`);
        if (correctElem) {
            q.correctAnswer = correctElem.value ? correctElem.value : null;
        }

        const expElem = document.getElementById(`edit_q_explanation_${qIdx}`);
        if (expElem) {
            q.explanation = expElem.value.trim() ? expElem.value.trim() : null;
        }
    });

    saveStateToStorage(true);
    closeEditSurveyModal();
    renderApp();
    showToast("Encuesta, respuestas y retroalimentación guardadas", "success");
}

// ==========================================
// 11. REINICIO DE DATOS Y NOTIFICACIONES
// ==========================================
function resetData() {
    if (confirm("¿Seguro que deseas borrar todas las respuestas registradas en esta sesión?")) {
        state.submissions = [];
        state.survey.activeBlock = 0;
        state.revealedAnswers = {};
        saveStateToStorage(true);
        if (socket) {
            socket.emit('reset_poll_data');
        }
        renderApp();
        showToast("Datos reiniciados en todos los dispositivos", "info");
    }
}

function showToast(message, type = "info") {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');

    const colors = {
        success: "bg-emerald-600 border-emerald-500",
        warning: "bg-amber-600 border-amber-500",
        info: "bg-indigo-600 border-indigo-500"
    };

    toast.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold flex items-center gap-2 transition-all duration-300 opacity-0 transform translate-y-2`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('opacity-0', 'translate-y-2'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}