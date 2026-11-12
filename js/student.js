/*
Administra el login, renderizado de las tarjetas del alumno y envío del bloque.
*/

import { CONFIG } from './config.js';
import { state, SurveyUtils } from './state.js';
import { socket, saveStateToStorage } from './socket.js';
import { showToast } from './utils.js';

export function renderStudentView() {
    const loginCard = document.getElementById('studentLoginCard');
    const formCard = document.getElementById('studentFormCard');

    if (!state.currentStudent) {
        if (loginCard) loginCard.classList.remove('hidden');
        if (formCard) formCard.classList.add('hidden');
        return;
    }

    if (loginCard) loginCard.classList.add('hidden');
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

    const studentSub = state.submissions.find(s => s.studentId === state.currentStudent.id);
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

export function renderStudentQuestions(questions, studentSub) {
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
            <div class="space-y-2.5">${optionsHTML}</div>
        `;
        container.appendChild(qCard);
    });
}

export function handleStudentLogin(e, onRender) {
    e.preventDefault();
    const nameInput = document.getElementById('inputStudentName');
    const roomInput = document.getElementById('inputRoomCode');

    if (!nameInput || !roomInput) return;

    const name = nameInput.value.trim();
    const roomCode = roomInput.value.trim().toUpperCase();

    if (name && roomCode) {
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
        state.currentStudent = { name, id };
        state.roomCode = roomCode;

        localStorage.setItem(CONFIG.STORAGE_KEYS.STUDENT, JSON.stringify(state.currentStudent));
        localStorage.setItem('classpoll_room_code', roomCode);

        if (socket) {
            // El alumno solicita unirse con el rol 'student'
            socket.emit('join_room', {
                roomCode: state.roomCode,
                role: 'student',
                studentData: state.currentStudent
            });
        }

        if (onRender) onRender();
    }
}

export function studentLogout(onRender) {
    state.currentStudent = null;
    localStorage.removeItem(CONFIG.STORAGE_KEYS.STUDENT);
    if (onRender) onRender();
    showToast("Sesión cerrada correctamente", "info");
}

export function handleStudentSubmitBlock(e, onRender) {
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
    if (onRender) onRender();
    showToast("Respuestas enviadas y sincronizadas con el profesor", "success");
}