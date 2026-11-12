/**
Gestiona la comunicación en tiempo real con Socket.io y la sincronización con localStorage y BroadcastChannel
 */

import { CONFIG, DEFAULT_SURVEY } from './config.js';
import { state, enrichSurveyWithMetadata } from './state.js';

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
                    badge.textContent = "Conectado en Vivo";
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
                    if (onRender) onRender();
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
        }
    } catch (e) {
        console.warn("Modo local/standalone activado:", e);
    }
}

export function saveStateToStorage(isTeacherAction = false) {
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