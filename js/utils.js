/*
Contiene alertas visuales (Toast) y la función de reinicio de datos.
*/

import { state } from './state.js';
import { socket, saveStateToStorage } from './socket.js';

export function showToast(message, type = "info") {
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

export function resetData(onRender) {
    if (confirm("¿Estás seguro de que deseas reiniciar todas las respuestas de la sala?")) {
        // 1. Limpiar respuestas y estados de revelado
        state.submissions = [];
        state.revealedAnswers = {};

        // 2. Pausar la encuesta para devolver a los alumnos a la pantalla de bienvenida
        if (state.survey) {
            state.survey.isStarted = false;
            state.survey.blockStartTime = null;
        }

        // 3. Sincronizar estado global y re-renderizar
        saveStateToStorage(true);
        if (onRender) onRender();

        showToast("Respuestas reiniciadas. Los estudiantes regresaron a la sala de espera.", "info");
    }
}

// Variable global para almacenar la referencia del intervalo
let timerInterval = null;

// Formatea segundos a formato MM:SS
export function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Inicia el ciclo del cronómetro sincronizado
export function initBlockTimer(state) {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const teacherTimer = document.getElementById('teacherBlockTimer');
        const studentTimer = document.getElementById('studentBlockTimer');

        // Si la encuesta no ha iniciado o no hay marca de tiempo, resetear a 00:00
        if (!state.survey || !state.survey.isStarted || !state.survey.blockStartTime) {
            if (teacherTimer) teacherTimer.textContent = "00:00";
            if (studentTimer) studentTimer.textContent = "00:00";
            return;
        }

        // Calcular segundos transcurridos desde el inicio del bloque
        const elapsedSeconds = Math.floor((Date.now() - state.survey.blockStartTime) / 1000);
        const formatted = formatTime(elapsedSeconds);

        if (teacherTimer) teacherTimer.textContent = formatted;
        if (studentTimer) studentTimer.textContent = formatted;
    }, 1000);
}