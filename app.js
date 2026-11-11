/**
 * LÓGICA DE LA APLICACIÓN DE ENCUESTAS MULTIUSUARIO
 * Sincronización en tiempo real con Socket.io y fallback BroadcastChannel
 */

// CONEXIÓN SOCKET EN TIEMPO REAL CON RECONEXIÓN AUTOMÁTICA
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
                    if (data.surveyData) surveyData = data.surveyData;
                    if (data.submissions && data.submissions.length > 0) submissions = data.submissions;
                    if (data.activeStudents) activeStudents = data.activeStudents;
                    renderApp();
                }
            });

            socket.on('poll_state_updated', (data) => {
                if (data) {
                    if (data.surveyData) {
                        // Preservar la respuesta correcta y explicación si la versión entrante no las trae
                        if (surveyData && surveyData.questions) {
                            data.surveyData.questions.forEach((q, idx) => {
                                const localQ = surveyData.questions[idx];
                                if (localQ) {
                                    if (!q.correctAnswer && localQ.correctAnswer) q.correctAnswer = localQ.correctAnswer;
                                    if (!q.explanation && localQ.explanation) q.explanation = localQ.explanation;
                                }
                            });
                        }
                        surveyData = data.surveyData;
                    }
                    if (data.submissions) submissions = data.submissions;
                    if (data.activeStudents) activeStudents = data.activeStudents;
                    renderApp();
                }
            });
        }
    } catch (e) {
        console.log("Modo standalone/local activado", e);
    }
}

// Inicializar la conexión socket inmediatamente al cargar la página
initSocketConnection();

// 1. DATOS POR DEFECTO CON PREGUNTAS INTERCALADAS CON CERTEZA
const DEFAULT_SURVEY = {
    title: "Conceptos Fundamentales de Física y Termodinámica",
    activeBlock: 0,
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

// Claves de almacenamiento v3 para renovar caché del navegador
let surveyData = JSON.parse(localStorage.getItem('classpoll_survey_v3')) || DEFAULT_SURVEY;
let submissions = JSON.parse(localStorage.getItem('classpoll_submissions_v3')) || [];
let activeStudents = [];
let currentStudent = JSON.parse(localStorage.getItem('classpoll_current_student_v3')) || null;
let currentRole = 'student';
let isTeacherAuthenticated = false;
const TEACHER_PIN = "1234";
let pendingTeacherAction = null;
let chartInstances = {};

// Sincronización entre pestañas locales del mismo navegador
const pollChannel = new BroadcastChannel('classpoll_live_sync');

function saveStateToStorage() {
    localStorage.setItem('classpoll_survey_v3', JSON.stringify(surveyData));
    localStorage.setItem('classpoll_submissions_v3', JSON.stringify(submissions));
    localStorage.setItem('classpoll_current_student_v3', JSON.stringify(currentStudent));
    pollChannel.postMessage({ type: 'SYNC' });

    if (socket) {
        if (isTeacherAction) {
            // El profesor actualiza la encuesta y las respuestas
            socket.emit('update_poll_state', { surveyData, submissions });
        } else {
            // El estudiante SOLO envía las respuestas para no borrar correctAnswer/explanation
            socket.emit('update_poll_state', { submissions });
        }
    }
}

// INICIALIZACIÓN MULTIUSUARIO
window.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    initSocketConnection();
    switchRole('student');

    pollChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'SYNC') {
            surveyData = JSON.parse(localStorage.getItem('classpoll_survey_v3')) || DEFAULT_SURVEY;
            submissions = JSON.parse(localStorage.getItem('classpoll_submissions_v3')) || [];
            renderApp();
        }
    };
});

// 2. SEGURIDAD Y CONTROL DE PIN
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

// 3. CAMBIO DE ROL (Profesor / Estudiante)
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

// 4. MOTOR DE RENDERIZADO PRINCIPAL
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

    const totalBlocks = Math.ceil(surveyData.questions.length / 2);
    const currentBlockIdx = surveyData.activeBlock;

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
    const totalBlocks = Math.ceil(surveyData.questions.length / 2);
    const newBlock = surveyData.activeBlock + delta;

    if (newBlock >= 0 && newBlock < totalBlocks) {
        surveyData.activeBlock = newBlock;
        saveStateToStorage();
        if (socket) {
            socket.emit('update_poll_state', { surveyData, submissions });
        }
        renderApp();
        showToast(`Bloque ${newBlock + 1} activado para los estudiantes`, "info");
    }
}

// 5. RENDIMIENTO DE GRÁFICOS (Chart.js)
function renderBlockCharts() {
    const container = document.getElementById('chartsContainer');
    if (!container) return;
    container.innerHTML = '';

    const startIndex = surveyData.activeBlock * 2;
    const blockQuestions = surveyData.questions.slice(startIndex, startIndex + 2);

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

    // Colorear en verde esmeralda la respuesta correcta y en índigo las demás
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
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500 italic">No hay datos registrados aún.</td></tr>`;
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
            <td class="py-3 px-4 text-slate-400 font-mono">${sub.studentId}</td>
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

// 6. RENDERIZADO VISTA ESTUDIANTE
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
    const displayId = document.getElementById('studentDisplayId');
    if (displayName) displayName.textContent = currentStudent.name;
    if (displayId) displayId.textContent = `ID: ${currentStudent.id}`;

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
    const idInput = document.getElementById('inputStudentId');

    if (!nameInput || !idInput) return;

    const name = nameInput.value.trim();
    const id = idInput.value.trim();

    if (name && id) {
        currentStudent = { name, id };
        localStorage.setItem('classpoll_current_student_v3', JSON.stringify(currentStudent));

        if (socket) {
            socket.emit('student_joined', currentStudent);
        }

        renderApp();
        showToast(`Bienvenido, ${name}`, "success");
    }
}

function studentLogout() {
    currentStudent = null;
    localStorage.removeItem('classpoll_current_student_v3');
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

    const startIndex = surveyData.activeBlock * 2;
    const blockQuestions = surveyData.questions.slice(startIndex, startIndex + 2);

    blockQuestions.forEach(q => {
        const selected = document.querySelector(`input[name="question_${q.id}"]:checked`);
        if (selected) {
            submissions[subIndex].answers[q.id] = selected.value;
        }
    });

    submissions[subIndex].timestamp = new Date().toISOString();

    saveStateToStorage();
    renderApp();
    showToast("Respuestas enviadas y sincronizadas con el profesor", "success");
}

// 7. EXPORTADOR A CSV CODIFICADO
function exportToCSV() {
    if (submissions.length === 0) {
        showToast("No hay datos cargados para exportar", "warning");
        return;
    }

    let headers = ["Nombre_Estudiante", "Carne_ID", "Fecha_Hora"];

    surveyData.questions.forEach((q, idx) => {
        headers.push(`P${idx + 1}_Codigo`);
        headers.push(`P${idx + 1}_Texto`);
    });

    let csvRows = [headers.join(",")];

    submissions.forEach(sub => {
        let row = [
            `"${sub.studentName.replace(/"/g, '""')}"`,
            `"${sub.studentId.replace(/"/g, '""')}"`,
            `"${sub.timestamp}"`
        ];

        surveyData.questions.forEach(q => {
            const answerText = sub.answers ? sub.answers[q.id] : null;
            if (answerText) {
                const optCode = q.options.indexOf(answerText) + 1;
                row.push(optCode);
                row.push(`"${answerText.replace(/"/g, '""')}"`);
            } else {
                row.push(0);
                row.push('"Sin Responder"');
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

// EDITAR ENCUESTA Y REINICIAR
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

function renderQuestionsEditor() {
    const container = document.getElementById('questionsEditorContainer');
    if (!container) return;
    container.innerHTML = '';

    surveyData.questions.forEach((q, qIdx) => {
        const qDiv = document.createElement('div');
        qDiv.className = "bg-slate-900 border border-slate-700/80 rounded-xl p-4 space-y-3";
        qDiv.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-indigo-400">Pregunta #${qIdx + 1}</span>
                <button onclick="removeQuestionField(${qIdx})" class="text-xs text-red-400 hover:text-red-300">Eliminar</button>
            </div>
            <input type="text" value="${q.text}" id="edit_q_text_${qIdx}" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs">
        `;
        container.appendChild(qDiv);
    });
}

function addNewQuestionField() {
    surveyData.questions.push({
        id: `q_${Date.now()}`,
        text: "Nueva pregunta de prueba",
        type: "multiple",
        options: ["Opción 1", "Opción 2", "Opción 3", "Opción 4"]
    });
    renderQuestionsEditor();
}

function removeQuestionField(idx) {
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
        const inputElem = document.getElementById(`edit_q_text_${qIdx}`);
        if (inputElem) q.text = inputElem.value;
    });

    saveStateToStorage();
    closeEditSurveyModal();
    renderApp();
    showToast("Encuesta actualizada", "success");
}

function resetData() {
    if (confirm("¿Seguro que deseas borrar todas las respuestas registradas en esta sesión?")) {
        submissions = [];
        surveyData.activeBlock = 0;
        saveStateToStorage();
        if (socket) {
            socket.emit('reset_poll_data');
        }
        renderApp();
        showToast("Datos reiniciados en todos los dispositivos", "info");
    }
}

// SISTEMA DE TOASTS
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

// EXPORTAR E IMPORTAR CONFIGURACIÓN DE ENCUESTA EN JSON
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
                
                // Guardar en el almacenamiento local y transmitir por Socket.io a los estudiantes
                saveStateToStorage();
                renderApp();
                showToast("Encuesta cargada exitosamente y publicada a los estudiantes", "success");
            } else {
                showToast("El archivo JSON debe contener un arreglo de al menos 2 preguntas válido.", "warning");
            }
        } catch (err) {
            showToast("Error al procesar el archivo JSON. Verifique la sintaxis.", "warning");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Limpiar input para permitir re-selección
}