/**
Gestiona la comunicación en tiempo real con Socket.io y la sincronización con localStorage y BroadcastChannel
 */

import { CONFIG } from './config.js';
import { state, enrichSurveyWithMetadata } from './state.js';
import { showToast } from './utils.js';
import { openRoomSelectionModal } from './teacher.js';

export let socket = null;
export const pollChannel = new BroadcastChannel(CONFIG.SYNC_CHANNEL);

export function initSocketConnection(onRender) {
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
                    badge.textContent = state.roomCode ? `En Vivo (${state.roomCode})` : "Desconectado";
                    badge.className = "text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
                }
                
                // Reconexión automática EXCLUSIVA para estudiantes
                if (state.roomCode && state.currentRole === 'student' && state.currentStudent) {
                    socket.emit('join_room', {
                        roomCode: state.roomCode,
                        role: 'student',
                        studentData: state.currentStudent
                    });
                }
            });

            socket.on('init_state', (data) => {
                if (data) {
                    if (data.code) {
                        state.roomCode = data.code;
                        localStorage.setItem('classpoll_room_code', data.code);
                    }
                    if (data.surveyData) state.survey = enrichSurveyWithMetadata(data.surveyData);
                    if (data.submissions) state.submissions = data.submissions;
                    if (data.activeStudents) state.activeStudents = data.activeStudents;
                    
                    // Cerrar modal y RECIÉN AHORA mostrar el Dashboard Docente
                    closeRoomSelectionModal();
                    if (state.currentRole === 'teacher') {
                        const teacherView = document.getElementById('teacherView');
                        if (teacherView) teacherView.classList.remove('hidden');
                    }

                    if (onRender) onRender();
                }
            });

            socket.on('room_error', (data) => {
                showToast(data.message, "warning");

                state.roomCode = '';
                localStorage.removeItem('classpoll_room_code');

                if (state.currentRole === 'teacher') {
                    // Mantener oculto el dashboard y mantener visible el modal de selección
                    const teacherView = document.getElementById('teacherView');
                    if (teacherView) teacherView.classList.add('hidden');
                    openRoomSelectionModal();
                }
            });

            socket.on('poll_state_updated', (data) => {
                if (data) {
                    if (data.surveyData) state.survey = enrichSurveyWithMetadata(data.surveyData);
                    if (data.submissions) state.submissions = data.submissions;
                    if (data.activeStudents) state.activeStudents = data.activeStudents;
                    if (onRender) onRender();
                }
            });

            socket.on('room_error', (data) => {
                showToast(data.message, "warning");

                // Limpiar el código de sala inexistente del estado y del almacenamiento local
                state.roomCode = '';
                localStorage.removeItem('classpoll_room_code');

                if (state.currentRole === 'student') {
                    state.currentStudent = null;
                    localStorage.removeItem(CONFIG.STORAGE_KEYS.STUDENT);
                } else if (state.currentRole === 'teacher') {
                    // Ocultar el dashboard del profesor y abrir el modal de gestión de salas
                    const teacherView = document.getElementById('teacherView');
                    if (teacherView) teacherView.classList.add('hidden');
                    openRoomSelectionModal();
                }

                if (onRender) onRender();
            });
        }
    } catch (e) {
        console.warn("Modo local/standalone activado:", e);
    }
}

export function saveStateToStorage(isTeacherAction = false) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SURVEY, JSON.stringify(state.survey));
    localStorage.setItem(CONFIG.STORAGE_KEYS.SUBMISSIONS, JSON.stringify(state.submissions));
    localStorage.setItem(CONFIG.STORAGE_KEYS.STUDENT, JSON.stringify(state.currentStudent));
    if (state.roomCode) localStorage.setItem('classpoll_room_code', state.roomCode);

    pollChannel.postMessage({ type: 'SYNC' });

    if (socket && state.roomCode) {
        if (isTeacherAction) {
            socket.emit('update_poll_state', { surveyData: state.survey, submissions: state.submissions });
        } else {
            socket.emit('update_poll_state', { submissions: state.submissions });
        }
    }
}