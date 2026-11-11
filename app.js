/**
 * LÓGICA DE LA APLICACIÓN DE ENCUESTAS MULTIUSUARIO
 * ----------------------------------------------------
 * Incorpora resolución dinámica de Host de Socket.io para
 * sincronización en tiempo real entre Celulares y Computadora.
 */

// CONEXIÓN SOCKET EN TIEMPO REAL CON RESOLUCIÓN AUTOMÁTICA DE IP
let socket = null;
try {
    if (typeof io !== 'undefined') {
        // Se conecta explícitamente a la IP/Origen desde donde el dispositivo abrió la página
        socket = io(window.location.origin, {
            transports: ['websocket', 'polling']
        });
    }
} catch (e) {
    console.log("Modo standalone/local activado");
}

// 1. DATOS POR DEFECTO Y ESTADO
const DEFAULT_SURVEY = {
    title: "Conceptos Fundamentales de Física y Termodinámica",
    activeBlock: 0,
    questions: [
        {
            id: "q1",
            text: "¿Qué ocurre con la presión de un gas ideal si se reduce su volumen a la mitad manteniendo la temperatura constante?",
            type: "multiple",
            options: [
                "Se reduce a la mitad",
                "Se duplica (Ley de Boyle)",
                "Permanece inalterada",
                "Aumenta cuatro veces"
            ]
        },
        {
            id: "q2",
            text: "Según la primera ley de la termodinámica, el cambio en la energía interna de un sistema es igual a:",
            type: "multiple",
            options: [
                "El calor añadido menos el trabajo realizado",
                "El trabajo realizado dividido entre el calor",
                "Únicamente la temperatura final",
                "Cero en todos los procesos reales"
            ]
        },
        {
            id: "q3",
            text: "¿Cuál es la unidad del Sistema Internacional para medir la entropía?",
            type: "multiple",
            options: [
                "Joule por Kelvin (J/K)",
                "Pascal por Metro (Pa/m)",
                "Newton por Segundo (N/s)",
                "Calorías por Gramo (cal/g)"
            ]
        },
        {
            id: "q4",
            text: "¿En qué aplicación cotidiana observas transferencia de calor principalmente por radiación?",
            type: "multiple",
            options: [
                "El sol calentando la superficie de la Tierra",
                "Agua hirviendo en una olla al fuego",
                "Una cuchara metálica en un café caliente",
                "El aire acondicionado enfriando una habitación"
            ]
        }
    ]
};

let surveyData = JSON.parse(localStorage.getItem('classpoll_survey')) || DEFAULT_SURVEY;
let submissions = JSON.parse(localStorage.getItem('classpoll_submissions')) || [];
let currentStudent = JSON.parse(localStorage.getItem('classpoll_current_student')) || null;
let currentRole = 'student';
let isTeacherAuthenticated = false;
const TEACHER_PIN = "1234";
let pendingTeacherAction = null;
let chartInstances = {};

// Sincronización en Tiempo Real entre pestañas o sockets
const pollChannel = new BroadcastChannel('classpoll_live_sync');

function saveStateToStorage() {
    localStorage.setItem('classpoll_survey', JSON.stringify(surveyData));
    localStorage.setItem('classpoll_submissions', JSON.stringify(submissions));
    localStorage.setItem('classpoll_current_student', JSON.stringify(currentStudent));
    pollChannel.postMessage({ type: 'SYNC' });
    
    // Transmitir inmediatamente a través de WebSockets si el servidor está conectado
    if (socket && socket.connected) {
        socket.emit('update_poll_state', { surveyData, submissions });
    }
}

// INICIALIZACIÓN MULTIUSUARIO
window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    switchRole('student');

    // Escuchar estado inicial recibido desde el servidor Node.js
    if (socket) {
        socket.on('connect', () => {
            console.log("Conectado con éxito al servidor WebSocket en vivo");
            const badge = document.getElementById('sessionStatusBadge');
            if (badge) {
                badge.textContent = "Conectado en Vivo";
                badge.className = "text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
            }
        });

        socket.on('init_state', (data) => {
            if (data && data.surveyData) {
                surveyData = data.surveyData;
                submissions = data.submissions || [];
                localStorage.setItem('classpoll_survey', JSON.stringify(surveyData));
                localStorage.setItem('classpoll_submissions', JSON.stringify(submissions));
                renderApp();
            }
        });

        // Escuchar cuando cualquier estudiante o profesor realice cambios remotos
        socket.on('poll_state_updated', (data) => {
            if (data.surveyData) surveyData = data.surveyData;
            if (data.submissions) submissions = data.submissions;
            localStorage.setItem('classpoll_survey', JSON.stringify(surveyData));
            localStorage.setItem('classpoll_submissions', JSON.stringify(submissions));
            renderApp();
        });
    }

    // Backup local para pruebas en la misma máquina sin servidor
    pollChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'SYNC') {
            surveyData = JSON.parse(localStorage.getItem('classpoll_survey')) || DEFAULT_SURVEY;
            submissions = JSON.parse(localStorage.getItem('classpoll_submissions')) || [];
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
        document.getElementById('inputPin').value = '';
        document.getElementById('pinModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('inputPin').focus(), 100);
    }
}

function protectedAction(actionCallback) {
    if (isTeacherAuthenticated) {
        actionCallback();
    } else {
        pendingTeacherAction = actionCallback;
        document.getElementById('inputPin').value = '';
        document.getElementById('pinModal').classList.remove('hidden');
    }
}

function verifyPin(e) {
    e.preventDefault();
    const pinVal = document.getElementById('inputPin').value;
    if (pinVal === TEACHER_PIN) {
        isTeacherAuthenticated = true;
        closePinModal();
        showToast("Autenticación docente correcta", "success");
        if (pendingTeacherAction) {
            pendingTeacherAction();
            pendingTeacherAction = null;
        }
    } else {
        showToast("PIN incorrecto. Intenta de nuevo.", "warning");
    }
}

function closePinModal() {
    document.getElementById('pinModal').classList.add('hidden');
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
        btnTeacher.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-white bg-indigo-600 shadow-md";
        btnStudent.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-slate-400 hover:text-white";
        teacherView.classList.remove('hidden');
        studentView.classList.add('hidden');
    } else {
        btnStudent.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-white bg-indigo-600 shadow-md";
        btnTeacher.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-slate-400 hover:text-white";
        studentView.classList.remove('hidden');
        teacherView.classList.add('hidden');
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
    lucide.createIcons();
}

function renderTeacherDashboard() {
    document.getElementById('teacherSessionTitle').textContent = surveyData.title;
    document.getElementById('totalQuestionsCount').textContent = `${surveyData.questions.length} preguntas en total`;
    document.getElementById('teacherTotalSubmissions').textContent = `${submissions.length} alumnos`;

    const totalBlocks = Math.ceil(surveyData.questions.length / 2);
    const currentBlockIdx = surveyData.activeBlock;

    document.getElementById('activeBlockBadge').textContent = `Bloque ${currentBlockIdx + 1} Activo`;
    document.getElementById('blockProgressText').textContent = `Bloque ${currentBlockIdx + 1} de ${totalBlocks}`;
    
    const progressPct = ((currentBlockIdx + 1) / totalBlocks) * 100;
    document.getElementById('blockProgressBar').style.width = `${progressPct}%`;

    document.getElementById('btnPrevBlock').disabled = currentBlockIdx === 0;
    document.getElementById('btnNextBlock').disabled = currentBlockIdx >= totalBlocks - 1;

    renderBlockCharts();
    renderParticipantsTable();
}

function changeActiveBlock(delta) {
    const totalBlocks = Math.ceil(surveyData.questions.length / 2);
    const newBlock = surveyData.activeBlock + delta;

    if (newBlock >= 0 && newBlock < totalBlocks) {
        surveyData.activeBlock = newBlock;
        saveStateToStorage();
        renderApp();
        showToast(`Bloque ${newBlock + 1} activado para los estudiantes`, "info");
    }
}

// 5. RENDIMIENTO DE GRÁFICOS (Chart.js)
function renderBlockCharts() {
    const container = document.getElementById('chartsContainer');
    container.innerHTML = '';

    const startIndex = surveyData.activeBlock * 2;
    const blockQuestions = surveyData.questions.slice(startIndex, startIndex + 2);

    blockQuestions.forEach((q, idx) => {
        const questionNumber = startIndex + idx + 1;

        const card = document.createElement('div');
        card.className = "bg-slate-900/60 border border-slate-700/80 rounded-xl p-5 flex flex-col justify-between space-y-4";

        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between text-xs text-indigo-400 font-semibold mb-1">
                    <span>Pregunta ${questionNumber}</span>
                    <span class="bg-indigo-500/10 px-2 py-0.5 rounded text-indigo-300">Opción Múltiple</span>
                </div>
                <h4 class="font-bold text-white text-sm leading-snug">${q.text}</h4>
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

    const ctx = canvas.getContext('2d');
    chartInstances[question.id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: question.options.map(opt => opt.length > 25 ? opt.substring(0, 25) + '...' : opt),
            datasets: [{
                label: 'Respuestas',
                data: counts,
                backgroundColor: 'rgba(99, 102, 241, 0.75)',
                borderColor: 'rgba(99, 102, 241, 1)',
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
    tbody.innerHTML = '';
    document.getElementById('logCountBadge').textContent = `${submissions.length} participantes registrados`;

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
        loginCard.classList.remove('hidden');
        formCard.classList.add('hidden');
        return;
    }

    loginCard.classList.add('hidden');
    formCard.classList.remove('hidden');

    document.getElementById('studentDisplayName').textContent = currentStudent.name;
    document.getElementById('studentDisplayId').textContent = `ID: ${currentStudent.id}`;

    const activeBlockIdx = surveyData.activeBlock;
    const startIndex = activeBlockIdx * 2;
    const blockQuestions = surveyData.questions.slice(startIndex, startIndex + 2);

    document.getElementById('studentBlockBadge').textContent = `Bloque ${activeBlockIdx + 1} (Preguntas ${startIndex + 1} y ${startIndex + blockQuestions.length})`;

    const studentSub = submissions.find(s => s.studentId === currentStudent.id);
    const hasAnsweredBlock = blockQuestions.every(q => studentSub && studentSub.answers && studentSub.answers[q.id]);

    const waitingBanner = document.getElementById('waitingBlockBanner');
    const studentForm = document.getElementById('studentBlockForm');

    if (hasAnsweredBlock) {
        waitingBanner.classList.remove('hidden');
        studentForm.classList.add('hidden');
    } else {
        waitingBanner.classList.add('hidden');
        studentForm.classList.remove('hidden');
        renderStudentQuestions(blockQuestions, studentSub);
    }
}

function renderStudentQuestions(questions, studentSub) {
    const container = document.getElementById('studentQuestionsContainer');
    container.innerHTML = '';

    questions.forEach((q, idx) => {
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
    const name = document.getElementById('inputStudentName').value.trim();
    const id = document.getElementById('inputStudentId').value.trim();

    if (name && id) {
        currentStudent = { name, id };
        saveStateToStorage();
        renderApp();
        showToast(`Bienvenido, ${name}`, "success");
    }
}

function studentLogout() {
    currentStudent = null;
    saveStateToStorage();
    renderApp();
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

    // Guardar en almacenamiento local y notificar por canal de pestañas
    saveStateToStorage();

    // Emitir inmediatamente al servidor Node.js vía WebSocket
    if (socket && socket.connected) {
        socket.emit('update_poll_state', { surveyData, submissions });
    }

    renderApp();
    showToast("Respuestas enviadas y sincronizadas con el profesor", "success");
}

// 7. EXPORTADOR A CSV CODIFICADO (PARA PROCESAMIENTO ESTADÍSTICO)
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
                const optCode = q.options.indexOf(answerText) + 1; // Código 1, 2, 3...
                row.push(optCode);
                row.push(`"${answerText.replace(/"/g, '""')}"`);
            } else {
                row.push(0); // 0 = Sin respuesta
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
        document.getElementById('editSessionTitle').value = surveyData.title;
        renderQuestionsEditor();
        document.getElementById('editSurveyModal').classList.remove('hidden');
    });
}

function closeEditSurveyModal() {
    document.getElementById('editSurveyModal').classList.add('hidden');
}

function renderQuestionsEditor() {
    const container = document.getElementById('questionsEditorContainer');
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
    const titleVal = document.getElementById('editSessionTitle').value.trim();
    if (titleVal) surveyData.title = titleVal;

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
        if (socket && socket.connected) {
            socket.emit('reset_poll_data');
        }
        renderApp();
        showToast("Datos reiniciados en todos los dispositivos", "info");
    }
}

// SISTEMA DE TOASTS
function showToast(message, type = "info") {
    const container = document.getElementById('toastContainer');
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