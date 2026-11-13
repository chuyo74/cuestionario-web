/*
Es el punto de entrada de la aplicación. Se encarga de exponer las funciones necesarias al ámbito global window para mantener la compatibilidad con los atributos HTML existentes.
*/

import { CONFIG, DEFAULT_SURVEY } from './config.js';
import { state, SurveyUtils, enrichSurveyWithMetadata } from './state.js';
import { initSocketConnection, saveStateToStorage, pollChannel } from './socket.js';
import { showToast, resetData } from './utils.js';
import { trySwitchToTeacher, protectedAction, verifyPin, closePinModal, switchRole } from './auth.js';
import { 
    openRoomSelectionModal,
    closeRoomSelectionModal,
    handleCreateNewRoom,
    handleManageExistingRoom,
    renderTeacherDashboard, 
    updateQuestionsPerBlock, 
    changeActiveBlock, 
    toggleAnswerVisibility, 
    openEditSurveyModal, 
    closeEditSurveyModal, 
    addOptionField, 
    removeOptionField, 
    addNewQuestionField, 
    removeQuestionField, 
    saveSurveyChanges 
} from './teacher.js';
import { renderStudentView, handleStudentLogin, studentLogout, handleStudentSubmitBlock } from './student.js';
import { exportToCSV, exportSurveyJSON, triggerImportJSON, importSurveyJSON } from './export.js';
import { handleDeleteRoom } from './teacher.js';

window.handleDeleteRoom = handleDeleteRoom;

// Motor principal de renderizado
function renderApp() {
    const btnReset = document.getElementById('btnResetData');
    if (btnReset) {
        if (state.currentRole === 'teacher') {
            btnReset.classList.remove('hidden');
        } else {
            btnReset.classList.add('hidden');
        }
    }
    if (state.currentRole === 'teacher') {
        renderTeacherDashboard(renderApp);
    } else {
        renderStudentView();
    }
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Sincronización entre pestañas locales
pollChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'SYNC') {
        state.survey = enrichSurveyWithMetadata(JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SURVEY)) || DEFAULT_SURVEY);
        state.submissions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SUBMISSIONS)) || [];
        renderApp();
    }
};

// =========================================================
// ASIGNACIÓN AL OBJETO GLOBAL WINDOW (Eventos inline HTML)
// =========================================================

// Roles y Autenticación
window.trySwitchToTeacher = () => trySwitchToTeacher(renderApp);
window.switchRole = (role) => switchRole(role, renderApp);
window.verifyPin = (e) => verifyPin(e, renderApp);
window.closePinModal = closePinModal;
window.protectedAction = protectedAction;

// Gestión de Salas (Docente)
window.openRoomSelectionModal = openRoomSelectionModal;
window.closeRoomSelectionModal = closeRoomSelectionModal;
window.handleCreateNewRoom = handleCreateNewRoom;
window.handleManageExistingRoom = handleManageExistingRoom;

// Controles del Dashboard Docente
window.updateQuestionsPerBlock = (val) => updateQuestionsPerBlock(val, renderApp);
window.changeActiveBlock = (delta) => changeActiveBlock(delta, renderApp);
window.toggleAnswerVisibility = toggleAnswerVisibility;

// Formulario de Estudiante
window.handleStudentLogin = (e) => handleStudentLogin(e, renderApp);
window.studentLogout = () => studentLogout(renderApp);
window.handleStudentSubmitBlock = (e) => handleStudentSubmitBlock(e, renderApp);

// Exportación e Importación
window.exportToCSV = exportToCSV;
window.exportSurveyJSON = exportSurveyJSON;
window.triggerImportJSON = triggerImportJSON;
window.importSurveyJSON = (e) => importSurveyJSON(e, renderApp);

// Editor de Encuesta
window.openEditSurveyModal = openEditSurveyModal;
window.closeEditSurveyModal = closeEditSurveyModal;
window.addOptionField = addOptionField;
window.removeOptionField = removeOptionField;
window.addNewQuestionField = addNewQuestionField;
window.removeQuestionField = removeQuestionField;
window.saveSurveyChanges = () => saveSurveyChanges(renderApp);

// Reiniciar Datos
window.resetData = () => resetData(renderApp);

// =========================================================
// INICIALIZACIÓN
// =========================================================
window.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    initSocketConnection(renderApp);
    switchRole('student', renderApp);
});