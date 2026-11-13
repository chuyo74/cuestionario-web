/*
Maneja la verificación del PIN del docente y la conmutación de roles.
*/

import { CONFIG } from './config.js';
import { state } from './state.js';
import { showToast } from './utils.js';

let pendingTeacherAction = null;

export function trySwitchToTeacher(onRender) {
    if (state.isTeacherAuthenticated) {
        switchRole('teacher', onRender);
    } else {
        pendingTeacherAction = () => switchRole('teacher', onRender);
        const pinInput = document.getElementById('inputPin');
        const modal = document.getElementById('pinModal');
        if (pinInput) pinInput.value = '';
        if (modal) modal.classList.remove('hidden');
        setTimeout(() => pinInput && pinInput.focus(), 100);
    }
}

export function protectedAction(actionCallback) {
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

export function verifyPin(e, onRender) {
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
            switchRole('teacher', onRender);
        }
    } else {
        showToast("PIN incorrecto. Intenta de nuevo.", "warning");
    }
}

export function closePinModal() {
    const modal = document.getElementById('pinModal');
    if (modal) modal.classList.add('hidden');
    pendingTeacherAction = null;
}

export function switchRole(role, onRender) {
    if (role === 'teacher' && !state.isTeacherAuthenticated) {
        trySwitchToTeacher(onRender);
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
        if (studentView) studentView.classList.add('hidden');
        
        // SIEMPRE que se ingresa al modo profesor:
        // 1. Ocultar el dashboard docente
        if (teacherView) teacherView.classList.add('hidden');
        // 2. Abrir obligatoriamente el modal para elegir o crear sala
        openRoomSelectionModal();
    } else {
        if (btnStudent) btnStudent.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-white bg-indigo-600 shadow-md";
        if (btnTeacher) btnTeacher.className = "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-slate-400 hover:text-white";
        if (studentView) studentView.classList.remove('hidden');
        if (teacherView) teacherView.classList.add('hidden');
        closeRoomSelectionModal();
    }
    if (onRender) onRender();
}