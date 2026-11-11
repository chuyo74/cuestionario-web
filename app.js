/**
 * LÓGICA DE LA APLICACIÓN DE ENCUESTAS MULTIUSUARIO (ClassPoll Live)
 * Sincronización en tiempo real con Socket.io y fallback local.
 */

// 1. ESTRUCTURA DE ENCUESTA POR DEFECTO (Preguntas + Certeza)
const DEFAULT_SURVEY = {
    title: "Conceptos Fundamentales de Física y Termodinámica",
    activeBlock: 0,
    questionsPerBlock: 2,
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

// Función defensiva: garantiza que correctAnswer y explanation nunca se borren por paquetes de sincronización
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

// 2. CONEXIÓN Y ESTADO GLOBAL DE LA APLICACIÓN
let socket = null;

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
                console.log("Conectado con éxito al servidor en vivo");
                const badge = document.getElementById('sessionStatusBadge');
                if (badge) {
                    badge.textContent = "Conectado en Vivo";
                    badge.className = "text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
                }
                if (currentStudent && currentStudent.id) {
                    socket.emit('student_joined', currentStudent);
                }
            });

            socket.on('init_state', (data) => {
                if (data) {
                    if (data.surveyData) {
                        surveyData = enrichSurveyWithMetadata(data.surveyData);
                    }
                    if (data.submissions && data.submissions.length > 0) {
                        submissions = data.submissions;
                    }
                    if (data.activeStudents) {
                        activeStudents = data.activeStudents;
                    }
                    renderApp();
                }
            });

            socket.on('poll_state_updated', (data) => {
                if (data) {
                    if (data.surveyData) {
                        surveyData = enrichSurveyWithMetadata(data.surveyData);
                    }
                    if (data.submissions) {
                        submissions = data.submissions;
                    }
                    if (data.activeStudents) {
                        activeStudents = data.activeStudents;
                    }
                    renderApp();
                }
            });
        }
    } catch (e) {
        console.log("Modo standalone/local activado", e);
    }
}

// Inicializar conexión inmediatamente
initSocketConnection();

// Almacenamiento local con versión v4 para invalidar cachés viejas
let surveyData = enrichSurveyWithMetadata(JSON.parse(localStorage.getItem('classpoll_survey_v4')) || DEFAULT_SURVEY);
let submissions = JSON.parse(localStorage.getItem('classpoll_submissions_v4')) || [];
let activeStudents = [];
let currentStudent = JSON.parse(localStorage.getItem('classpoll_current_student_v4')) || null;
let currentRole = 'student';
let isTeacherAuthenticated = false;
const TEACHER_PIN = "1234";
let pendingTeacherAction = null;
let chartInstances = {};

// Sincronización entre pestañas locales del mismo navegador
const pollChannel = new BroadcastChannel('classpoll_live_sync');

function saveStateToStorage(isTeacherAction = false) {
    localStorage.setItem('classpoll_survey_v4', JSON.stringify(surveyData));
    localStorage.setItem('classpoll_submissions_v4', JSON.stringify(submissions));
    localStorage.setItem('classpoll_current_student_v4', JSON.stringify(currentStudent));
    pollChannel.postMessage({ type: 'SYNC' });

    if (socket) {
        if (isTeacherAction) {
            // El profesor envía la encuesta y las respuestas
            socket.emit('update_poll_state', { surveyData, submissions });
        } else {
            // El estudiante SOLO envía respuestas para no sobrescribir surveyData
            socket.emit('update_poll_state', { submissions });
        }
    }
}

// INICIALIZACIÓN AL CARGAR EL DOM
window.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    initSocketConnection();
    switchRole('student');

    pollChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'SYNC') {
            surveyData = enrichSurveyWithMetadata(JSON.parse(localStorage.getItem('classpoll_survey_v4')) || DEFAULT_SURVEY);
            submissions = JSON.parse(localStorage.getItem('classpoll_submissions_v4')) || [];
            renderApp();
        }
    };
});

// 3. SEGURIDAD Y CONTROL DE PIN
function trySwitchToTeacher() {
    if (isTeacherAuthenticated) {
        switchRole('teacher');
    } else {
        pendingTeacherAction = () => switchRole('teacher');
        const pinInput = document.getElementById('inputPin');
        const modal = document.getElementById('pinModal');
        if (pinInput) pinInput.value = '';
        if (modal) modal.classList.remove('hidden');
        setTimeout(() => {
            if (pinInput) pinInput.focus();
        }, 100);
    }
}

function protectedAction(actionCallback) {
    if (isTeacherAuthenticated) {
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
    if (pinVal === TEACHER_PIN) {
        isTeacherAuthenticated = true;
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

// 4. CAMBIO DE ROL (Profesor / Estudiante)
function switchRole(role) {
    if (role === 'teacher' && !isTeacherAuthenticated) {
        trySwitchToTeacher();
        return;
    }

    currentRole = role;
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

// 5. MOTOR DE RENDERIZADO PRINCIPAL
function renderApp() {
    if (currentRole === 'teacher') {
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
    if (titleElem) titleElem.textContent = surveyData.title;

    const totalCountElem = document.getElementById('totalQuestionsCount');
    if (totalCountElem) totalCountElem.textContent = `${surveyData.questions.length} preguntas en total`;

    const activeCount = activeStudents ? activeStudents.length : 0;
    const teacherSubElem = document.getElementById('teacherTotalSubmissions');
    if (teacherSubElem) teacherSubElem.textContent = `${activeCount} en línea (${submissions.length} con respuestas)`;

    const qpb = getQuestionsPerBlock();
    const totalBlocks = Math.ceil(surveyData.questions.length / qpb);
    const currentBlockIdx = surveyData.activeBlock;

    // Actualizar el valor seleccionado en el dropdown
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

function changeActiveBlock(delta) {
    const qpb = getQuestionsPerBlock();
    const totalBlocks = Math.ceil(surveyData.questions.length / qpb);
    const newBlock = surveyData.activeBlock + delta;

    if (newBlock >= 0 && newBlock < totalBlocks) {
        surveyData.activeBlock = newBlock;
        saveStateToStorage(true);
        renderApp();
        showToast(`Bloque ${newBlock + 1} activado para los estudiantes`, "info");
    }
}

// 6. RENDIMIENTO DE GRÁFICOS (Chart.js con respuesta correcta en verde)
function renderBlockCharts() {
    const container = document.getElementById('chartsContainer');
    if (!container) return;
    container.innerHTML = '';

    const qpb = getQuestionsPerBlock();
    const startIndex = surveyData.activeBlock * qpb;
    const blockQuestions = surveyData.questions.slice(startIndex, startIndex + qpb);

    blockQuestions.forEach((q, idx) => {
        const questionNumber = startIndex + idx + 1;

        const card = document.createElement('div');
        card.className = "bg-slate-900/60 border border-slate-700/80 rounded-xl p-5 flex flex-col justify-between space-y-4";

        const correctAnswerHTML = q.correctAnswer ? `
            <div class="mt-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs space-y-1">
                <div class="font-bold text-emerald-400 flex items-center gap-1.5">
                    <i data-lucide="check-circle-2" class="w-4 h-4"></i> Respuesta Correcta: ${q.correctAnswer}
                </div>
                ${q.explanation ? `<p class="text-slate-300 italic text-[11px] leading-relaxed">${q.explanation}</p>` : ''}
            </div>
        ` : '';

        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between text-xs text-indigo-400 font-semibold mb-1">
                    <span>Pregunta ${questionNumber}</span>
                    <span class="bg-indigo-500/10 px-2 py-0.5 rounded text-indigo-300">
                        ${q.correctAnswer ? 'Evaluación' : 'Escala de Certeza'}
                    </span>
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
}

function createOrUpdateChart(question) {
    const canvas = document.getElementById(`chart_q_${question.id}`);
    if (!canvas) return;

    const counts = question.options.map(() => 0);
    submissions.forEach(sub => {
        const answer = sub.answers ? sub.answers[question.id] : null;
        if (answer) {
            const optIndex = question.options.indexOf(answer);
            if (optIndex !== -1) counts[optIndex]++;
        }
    });

    if (chartInstances[question.id]) {
        chartInstances[question.id].destroy();
    }

    const bgColors = question.options.map(opt => 
        opt === question.correctAnswer ? 'rgba(16, 185, 129, 0.85)' : 'rgba(99, 102, 241, 0.65)'
    );
    const borderColors = question.options.map(opt => 
        opt === question.correctAnswer ? 'rgba(16, 185, 129, 1)' : 'rgba(99, 102, 241, 1)'
    );

    const ctx = canvas.getContext('2d');
    chartInstances[question.id] = new Chart(ctx, {
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
    if (countBadge) countBadge.textContent = `${submissions.length} participantes registrados`;

    if (submissions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500 italic">No hay datos registrados aún.</td></tr>`;
        return;
    }

    submissions.forEach(sub => {
        const answeredCount = Object.keys(sub.answers || {}).length;
        const totalCount = surveyData.questions.length;
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


// 7. RENDERIZADO VISTA ESTUDIANTE
function renderStudentView() {
    const loginCard = document.getElementById('studentLoginCard');
    const formCard = document.getElementById('studentFormCard');

    if (!currentStudent) {
        if (loginCard) loginCard.classList.remove('hidden');
        if (formCard) formCard.classList.add('hidden');
        return;
    }

    if (loginCard) loginCard.classList.add('hidden');
    if (formCard) formCard.classList.remove('hidden');

    const displayName = document.getElementById('studentDisplayName');
    if (displayName) displayName.textContent = currentStudent.name;

    const qpb = getQuestionsPerBlock();
    const activeBlockIdx = surveyData.activeBlock;
    const startIndex = activeBlockIdx * 2;
    const blockQuestions = surveyData.questions.slice(startIndex, startIndex + 2);

    const blockBadge = document.getElementById('studentBlockBadge');
    if (blockBadge) {
        blockBadge.textContent = `Bloque ${activeBlockIdx + 1} (Preguntas ${startIndex + 1} y ${startIndex + blockQuestions.length})`;
    }

    const studentSub = submissions.find(s => s.studentId === currentStudent.id);
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
                <span class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Pregunta #${surveyData.questions.indexOf(q) + 1}</span>
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
        // ID automático transparente para mantener el control de sesión en socket
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
        currentStudent = { name, id };
        localStorage.setItem('classpoll_current_student_v4', JSON.stringify(currentStudent));

        if (socket) {
            socket.emit('student_joined', currentStudent);
        }

        renderApp();
        showToast(`Bienvenido, ${name}`, "success");
    }
}


function studentLogout() {
    currentStudent = null;
    localStorage.removeItem('classpoll_current_student_v4');
    renderApp();
    showToast("Sesión cerrada correctamente", "info");
}

function handleStudentSubmitBlock(e) {
    e.preventDefault();
    if (!currentStudent) return;

    let subIndex = submissions.findIndex(s => s.studentId === currentStudent.id);
    if (subIndex === -1) {
        submissions.push({
            studentName: currentStudent.name,
            studentId: currentStudent.id,
            timestamp: new Date().toISOString(),
            answers: {}
        });
        subIndex = submissions.length - 1;
    }

    const qpb = getQuestionsPerBlock();
    const startIndex = surveyData.activeBlock * 2;
    const blockQuestions = surveyData.questions.slice(startIndex, startIndex + 2);

    blockQuestions.forEach(q => {
        const selected = document.querySelector(`input[name="question_${q.id}"]:checked`);
        if (selected) {
            submissions[subIndex].answers[q.id] = selected.value;
        }
    });

    submissions[subIndex].timestamp = new Date().toISOString();

    // El estudiante guarda y solo transmite sus respuestas
    saveStateToStorage(false);
    renderApp();
    showToast("Respuestas enviadas y sincronizadas con el profesor", "success");
}

// 8. EXPORTADOR E IMPORTADOR DE ARCHIVOS (CSV & JSON)
function exportToCSV() {
    if (submissions.length === 0) {
        showToast("No hay datos cargados para exportar", "warning");
        return;
    }

    let headers = ["Nombre_Estudiante"];

    surveyData.questions.forEach((q, idx) => {
        headers.push(`P${idx + 1}_Respuesta`);
        headers.push(`P${idx + 1}_Correcta`);
    });

    let csvRows = [headers.join(",")];

    submissions.forEach(sub => {
        let row = [
            `"${sub.studentName.replace(/"/g, '""')}"`
        ];

        surveyData.questions.forEach(q => {
            const answerText = sub.answers ? sub.answers[q.id] : null;
            
            // 1. Código numérico seleccionado por el estudiante (1, 2, 3... o 0 si no respondió)
            if (answerText) {
                const optCode = q.options.indexOf(answerText) + 1;
                row.push(optCode > 0 ? optCode : 0);
            } else {
                row.push(0);
            }

            // 2. Código numérico de la respuesta correcta (o 0 si no aplica/escala de certeza)
            if (q.correctAnswer) {
                const correctCode = q.options.indexOf(q.correctAnswer) + 1;
                row.push(correctCode > 0 ? correctCode : 0);
            } else {
                row.push(0); // Para preguntas de certeza u opinión sin solución fija
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
    if (!surveyData || !surveyData.questions) {
        showToast("No hay encuesta válida para exportar", "warning");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(surveyData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Encuesta_${(surveyData.title || 'cuestionario').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`);
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
    const file = event.target.files;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsedData = JSON.parse(e.target.result);
            if (parsedData && Array.isArray(parsedData.questions) && parsedData.questions.length >= 2) {
                surveyData = parsedData;
                if (typeof surveyData.activeBlock !== 'number') {
                    surveyData.activeBlock = 0;
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

// 9. EDITOR DE ENCUESTAS Y REINICIO
function openEditSurveyModal() {
    protectedAction(() => {
        const titleElem = document.getElementById('editSessionTitle');
        if (titleElem) titleElem.value = surveyData.title;
        renderQuestionsEditor();
        const modal = document.getElementById('editSurveyModal');
        if (modal) modal.classList.remove('hidden');
    });
}

function closeEditSurveyModal() {
    const modal = document.getElementById('editSurveyModal');
    if (modal) modal.classList.add('hidden');
}

// Sincroniza el estado que el profesor va escribiendo en el modal antes de re-renderizar
function syncEditorStateToData() {
    surveyData.questions.forEach((q, qIdx) => {
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

    surveyData.questions.forEach((q, qIdx) => {
        const qDiv = document.createElement('div');
        qDiv.className = "bg-slate-900 border border-slate-700/80 rounded-xl p-5 space-y-4 shadow-md";

        // Generar lista editable de opciones
        let optionsHTML = q.options.map((opt, oIdx) => `
            <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-bold text-slate-400 w-5">${String.fromCharCode(65 + oIdx)})</span>
                <input type="text" value="${opt.replace(/"/g, '&quot;')}" id="edit_q_opt_${qIdx}_${oIdx}" class="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500">
                <button type="button" onclick="removeOptionField(${qIdx}, ${oIdx})" class="text-xs text-red-400 hover:text-red-300 p-1" title="Eliminar opción">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `).join('');

        // Generar selector de respuesta correcta basado en las opciones actuales
        let correctOptionsHTML = `<option value="">-- Sin respuesta correcta --</option>`;
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
    if (surveyData.questions[qIdx]) {
        const num = surveyData.questions[qIdx].options.length + 1;
        surveyData.questions[qIdx].options.push(`Opción ${num}`);
        renderQuestionsEditor();
    }
}

function removeOptionField(qIdx, oIdx) {
    syncEditorStateToData();
    if (surveyData.questions[qIdx] && surveyData.questions[qIdx].options.length > 2) {
        surveyData.questions[qIdx].options.splice(oIdx, 1);
        renderQuestionsEditor();
    } else {
        showToast("Cada pregunta debe tener al menos 2 opciones.", "warning");
    }
}

function addNewQuestionField() {
    syncEditorStateToData();
    surveyData.questions.push({
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
    if (surveyData.questions.length <= 2) {
        showToast("Se requieren al menos 2 preguntas para la estructura de bloques.", "warning");
        return;
    }
    surveyData.questions.splice(idx, 1);
    renderQuestionsEditor();
}

function saveSurveyChanges() {
    const titleElem = document.getElementById('editSessionTitle');
    if (titleElem && titleElem.value.trim()) {
        surveyData.title = titleElem.value.trim();
    }

    surveyData.questions.forEach((q, qIdx) => {
        const textElem = document.getElementById(`edit_q_text_${qIdx}`);
        if (textElem && textElem.value.trim()) {
            q.text = textElem.value.trim();
        }

        // Recopilar opciones actualizadas
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

        // Leer respuesta correcta seleccionada
        const correctElem = document.getElementById(`edit_q_correct_${qIdx}`);
        if (correctElem) {
            q.correctAnswer = correctElem.value ? correctElem.value : null;
        }

        // Leer retroalimentación / explicación ingresada
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

function resetData() {
    if (confirm("¿Seguro que deseas borrar todas las respuestas registradas en esta sesión?")) {
        submissions = [];
        surveyData.activeBlock = 0;
        saveStateToStorage(true);
        if (socket) {
            socket.emit('reset_poll_data');
        }
        renderApp();
        showToast("Datos reiniciados en todos los dispositivos", "info");
    }
}

// 10. NOTIFICACIONES DE TIPO TOAST
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
    setTimeout(() => {
        toast.classList.remove('opacity-0', 'translate-y-2');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Obtener el número de preguntas por bloque (por defecto 2)
function getQuestionsPerBlock() {
    return (surveyData && surveyData.questionsPerBlock) ? surveyData.questionsPerBlock : 2;
}

// Función para actualizar el número de preguntas por bloque desde la vista del profesor
function updateQuestionsPerBlock(val) {
    const newQpb = parseInt(val, 10);
    if (newQpb >= 1 && newQpb <= 10) {
        surveyData.questionsPerBlock = newQpb;
        surveyData.activeBlock = 0; // Reiniciar al primer bloque para evitar desbordamiento
        saveStateToStorage(true);
        renderApp();
        showToast(`Cuestionario configurado a ${newQpb} pregunta(s) por bloque`, "info");
    }
}