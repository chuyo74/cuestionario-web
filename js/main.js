/*
Es el punto de entrada de la aplicación. Se encarga de exponer las funciones necesarias al ámbito global window para mantener la compatibilidad con los atributos HTML existentes.
*/

import { CONFIG, DEFAULT_SURVEY } from './config.js';
import { state, SurveyUtils, enrichSurveyWithMetadata } from './state.js';
import { initSocketConnection, saveStateToStorage, pollChannel } from './socket.js';
import { showToast, resetData } from './utils.js';
import { trySwitchToTeacher, protectedAction, verifyPin, closePinModal, switchRole } from './auth.js';
import { 
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

// Motor de renderizado global
function renderApp() {
    if (state.currentRole === 'teacher') {
        renderTeacherDashboard(renderApp);
    } else {
        renderStudentView();
    }
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Escucha entre pestañas locales del navegador
pollChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'SYNC') {
        state.survey = enrichSurveyWithMetadata(JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SURVEY)) || DEFAULT_SURVEY);
        state.submissions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SUBMISSIONS)) || [];
        renderApp();
    }
};

// VINCULACIÓN AL OBJETO GLOBAL WINDOW (Para eventos inline en HTML)
window.trySwitchToTeacher = () => trySwitchToTeacher(renderApp);
window.switchRole = (role) => switchRole(role, renderApp);
window.verifyPin = (e) => verifyPin(e, renderApp);
window.closePinModal = closePinModal;
window.protectedAction = protectedAction;

window.updateQuestionsPerBlock = (val) => updateQuestionsPerBlock(val, renderApp);
window.changeActiveBlock = (delta) => changeActiveBlock(delta, renderApp);
window.toggleAnswerVisibility = toggleAnswerVisibility;

window.handleStudentLogin = (e) => handleStudentLogin(e, renderApp);
window.studentLogout = () => studentLogout(renderApp);
window.handleStudentSubmitBlock = (e) => handleStudentSubmitBlock(e, renderApp);

window.exportToCSV = exportToCSV;
window.exportSurveyJSON = exportSurveyJSON;
window.triggerImportJSON = triggerImportJSON;
window.importSurveyJSON = (e) => importSurveyJSON(e, renderApp);

window.openEditSurveyModal = openEditSurveyModal;
window.closeEditSurveyModal = closeEditSurveyModal;
window.addOptionField = addOptionField;
window.removeOptionField = removeOptionField;
window.addNewQuestionField = addNewQuestionField;
window.removeQuestionField = removeQuestionField;
window.saveSurveyChanges = () => saveSurveyChanges(renderApp);

window.resetData = () => resetData(renderApp);

// Inicialización de la aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    initSocketConnection(renderApp);
    switchRole('student', renderApp);
});