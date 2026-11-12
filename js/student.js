/*
Administra el login, renderizado de las tarjetas del alumno y envío del bloque.
*/

import { CONFIG } from './config.js';
import { state, SurveyUtils } from './state.js';
import { socket, saveStateToStorage } from './socket.js';
import { showToast } from './utils.js';

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
            socket.emit('join_room', {
                roomCode: state.roomCode,
                studentData: state.currentStudent
            });
        }

        if (onRender) onRender();
        showToast(`Conectado a la Sala ${roomCode}`, "success");
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