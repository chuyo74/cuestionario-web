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
    if (confirm("¿Seguro que deseas borrar todas las respuestas registradas en esta sesión?")) {
        state.submissions = [];
        state.survey.activeBlock = 0;
        state.revealedAnswers = {};
        saveStateToStorage(true);
        if (socket) {
            socket.emit('reset_poll_data');
        }
        if (onRender) onRender();
        showToast("Datos reiniciados en todos los dispositivos", "info");
    }
}