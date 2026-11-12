/*
Genera el reporte codificado en CSV y permite exportar/importar la plantilla en JSON.
*/

import { state } from './state.js';
import { saveStateToStorage } from './socket.js';
import { showToast } from './utils.js';

export function exportToCSV() {
    if (state.submissions.length === 0) {
        showToast("No hay datos cargados para exportar", "warning");
        return;
    }

    let headers = ["Nombre_Estudiante"];
    state.survey.questions.forEach((q, idx) => {
        headers.push(`P${idx + 1}_Respuesta`);
        headers.push(`P${idx + 1}_Correcta`);
    });

    let csvRows = [headers.join(",")];

    state.submissions.forEach(sub => {
        let row = [`"${sub.studentName.replace(/"/g, '""')}"`];

        state.survey.questions.forEach(q => {
            const answerText = sub.answers ? sub.answers[q.id] : null;
            if (answerText) {
                const optCode = q.options.indexOf(answerText) + 1;
                row.push(optCode > 0 ? optCode : 0);
            } else {
                row.push(0);
            }

            if (q.correctAnswer) {
                const correctCode = q.options.indexOf(q.correctAnswer) + 1;
                row.push(correctCode > 0 ? correctCode : 0);
            } else {
                row.push(0);
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

export function exportSurveyJSON() {
    if (!state.survey || !state.survey.questions) {
        showToast("No hay encuesta válida para exportar", "warning");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.survey, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Encuesta_${(state.survey.title || 'cuestionario').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast("Estructura de la encuesta descargada en formato JSON", "success");
}

export function triggerImportJSON() {
    const fileInput = document.getElementById('importJsonInput');
    if (fileInput) fileInput.click();
}

export function importSurveyJSON(event, onRender) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsedData = JSON.parse(e.target.result);
            if (parsedData && Array.isArray(parsedData.questions) && parsedData.questions.length >= 2) {
                state.survey = parsedData;
                if (typeof state.survey.activeBlock !== 'number') {
                    state.survey.activeBlock = 0;
                }
                
                saveStateToStorage(true);
                if (onRender) onRender();
                showToast("Encuesta cargada exitosamente y publicada a los estudiantes", "success");
            } else {
                showToast("El archivo JSON debe contener al menos 2 preguntas válidas.", "warning");
            }
        } catch (err) {
            showToast("Error al procesar el archivo JSON. Verifique el formato.", "warning");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}