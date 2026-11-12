/*
Renderiza el panel docente, genera los gráficos de Chart.js y gestiona el editor de preguntas.
*/

import { state, SurveyUtils } from './state.js';
import { socket, saveStateToStorage } from './socket.js';
import { showToast } from './utils.js';
import { protectedAction } from './auth.js';

export function openRoomSelectionModal() {
    const modal = document.getElementById('roomSelectionModal');
    if (modal) modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function closeRoomSelectionModal() {
    const modal = document.getElementById('roomSelectionModal');
    if (modal) modal.classList.add('hidden');
}

export function handleCreateNewRoom() {
    const input = document.getElementById('inputNewRoomCode');
    if (!input || !input.value.trim()) {
        showToast("Ingresa un código para la nueva sala.", "warning");
        return;
    }

    const code = input.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (code && socket) {
        socket.emit('create_room', { roomCode: code });
    }
}

export function handleManageExistingRoom() {
    const input = document.getElementById('inputExistingRoomCode');
    if (!input || !input.value.trim()) {
        showToast("Ingresa el código de la sala que deseas gestionar.", "warning");
        return;
    }

    const code = input.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (code && socket) {
        socket.emit('join_room', {
            roomCode: code,
            role: 'teacher',
            studentData: null
        });
    }
}

export function promptCreateRoomCode(onRender) {
    const newCode = prompt("Ingresa el código para la nueva sala que deseas CREAR (ej. FISICA202):", state.roomCode);
    if (newCode && newCode.trim()) {
        const cleanCode = newCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (cleanCode) {
            if (socket) {
                // Emitir solicitud de creación exclusiva
                socket.emit('create_room', { roomCode: cleanCode });
            }
        }
    }
}

export function renderTeacherDashboard(onRender) {
    const titleElem = document.getElementById('teacherSessionTitle');
    if (titleElem) titleElem.textContent = state.survey.title;

    const roomBadge = document.getElementById('displayTeacherRoomCode');
    if (roomBadge) {
        roomBadge.textContent = state.roomCode ? `SALA: ${state.roomCode}` : 'SALA: NINGUNA';
    }

    const totalCountElem = document.getElementById('totalQuestionsCount');
    if (totalCountElem) totalCountElem.textContent = `${state.survey.questions.length} preguntas en total`;

    const activeCount = state.activeStudents ? state.activeStudents.length : 0;
    const teacherSubElem = document.getElementById('teacherTotalSubmissions');
    if (teacherSubElem) teacherSubElem.textContent = `${activeCount} en línea (${state.submissions.length} con respuestas)`;

    const qpb = SurveyUtils.getQuestionsPerBlock();
    const totalBlocks = SurveyUtils.getTotalBlocks();
    const currentBlockIdx = state.survey.activeBlock;

    const selectElem = document.getElementById('selectQuestionsPerBlock');
    if (selectElem) selectElem.value = qpb;

    const badgeElem = document.getElementById('activeBlockBadge');
    if (badgeElem) badgeElem.textContent = `Bloque ${currentBlockIdx + 1} Activo`;

    const progressTextElem = document.getElementById('blockProgressText');
    if (progressTextElem) progressTextElem.textContent = `Bloque ${currentBlockIdx + 1} de ${totalBlocks}`;

    const progressPct = ((currentBlockIdx + 1) / totalBlocks) * 100;
    const progressBarElem = document.getElementById('blockProgressBar');
    if (progressBarElem) progressBarElem.style.width = `${progressPct}%`;

    const btnPrev = document.getElementById('btnPrevBlock');
    const btnNext = document.getElementById('btnNextBlock');
    if (btnPrev) btnPrev.disabled = currentBlockIdx === 0;
    if (btnNext) btnNext.disabled = currentBlockIdx >= totalBlocks - 1;

    renderBlockCharts();
    renderParticipantsTable();
}

export function updateQuestionsPerBlock(val, onRender) {
    const newQpb = parseInt(val, 10);
    if (newQpb >= 1 && newQpb <= 10) {
        state.survey.questionsPerBlock = newQpb;
        state.survey.activeBlock = 0;
        saveStateToStorage(true);
        if (onRender) onRender();
        showToast(`Configurado a ${newQpb} pregunta(s) por bloque`, "info");
    }
}

export function changeActiveBlock(delta, onRender) {
    const totalBlocks = SurveyUtils.getTotalBlocks();
    const newBlock = state.survey.activeBlock + delta;

    if (newBlock >= 0 && newBlock < totalBlocks) {
        state.survey.activeBlock = newBlock;
        saveStateToStorage(true);
        if (onRender) onRender();
        showToast(`Bloque ${newBlock + 1} activado para los estudiantes`, "info");
    }
}

export function toggleAnswerVisibility(qId) {
    state.revealedAnswers[qId] = !state.revealedAnswers[qId];
    renderBlockCharts();
}

export function renderBlockCharts() {
    const container = document.getElementById('chartsContainer');
    if (!container) return;
    container.innerHTML = '';

    const qpb = SurveyUtils.getQuestionsPerBlock();
    const startIndex = state.survey.activeBlock * qpb;
    const blockQuestions = SurveyUtils.getCurrentBlockQuestions();

    blockQuestions.forEach((q, idx) => {
        const questionNumber = startIndex + idx + 1;
        const isRevealed = !!state.revealedAnswers[q.id];

        const toggleBtnHTML = q.correctAnswer ? `
            <button onclick="toggleAnswerVisibility('${q.id}')" class="px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all ${isRevealed ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'}">
                <i data-lucide="${isRevealed ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
                <span>${isRevealed ? 'Ocultar Respuesta' : 'Mostrar Respuesta'}</span>
            </button>
        ` : '';

        const correctAnswerHTML = q.correctAnswer ? `
            <div id="answer_box_${q.id}" class="${isRevealed ? '' : 'hidden'} mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs space-y-1 transition-all">
                <div class="font-bold text-emerald-400 flex items-center gap-1.5">
                    <i data-lucide="check-circle-2" class="w-4 h-4"></i> Respuesta Correcta: ${q.correctAnswer}
                </div>
                ${q.explanation ? `<p class="text-slate-300 italic text-[11px] leading-relaxed mt-1">${q.explanation}</p>` : ''}
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = "bg-slate-900/60 border border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xl";

        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between text-xs text-indigo-400 font-semibold mb-2">
                    <span class="bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">Pregunta ${questionNumber}</span>
                    ${toggleBtnHTML}
                </div>
                <h4 class="font-bold text-white text-sm leading-snug">${q.text}</h4>
                ${correctAnswerHTML}
            </div>
            <div class="relative h-56 w-full">
                <canvas id="chart_q_${q.id}"></canvas>
            </div>
        `;

        container.appendChild(card);
        setTimeout(() => createOrUpdateChart(q), 50);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function createOrUpdateChart(question) {
    const canvas = document.getElementById(`chart_q_${question.id}`);
    if (!canvas) return;

    const counts = question.options.map(() => 0);
    state.submissions.forEach(sub => {
        const answer = sub.answers ? sub.answers[question.id] : null;
        if (answer) {
            const optIndex = question.options.indexOf(answer);
            if (optIndex !== -1) counts[optIndex]++;
        }
    });

    if (state.chartInstances[question.id]) {
        state.chartInstances[question.id].destroy();
    }

    const isRevealed = !!state.revealedAnswers[question.id];

    const bgColors = question.options.map(opt => 
        (isRevealed && opt === question.correctAnswer) ? 'rgba(16, 185, 129, 0.85)' : 'rgba(99, 102, 241, 0.65)'
    );
    const borderColors = question.options.map(opt => 
        (isRevealed && opt === question.correctAnswer) ? 'rgba(16, 185, 129, 1)' : 'rgba(99, 102, 241, 1)'
    );

    const ctx = canvas.getContext('2d');
    state.chartInstances[question.id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: question.options.map(opt => opt.length > 25 ? opt.substring(0, 25) + '...' : opt),
            datasets: [{
                label: 'Respuestas',
                data: counts,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: 'rgba(51, 65, 85, 0.5)' } },
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });
}

export function renderParticipantsTable() {
    const tbody = document.getElementById('participantsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const countBadge = document.getElementById('logCountBadge');
    if (countBadge) countBadge.textContent = `${state.submissions.length} participantes registrados`;

    if (state.submissions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500 italic">No hay datos registrados aún.</td></tr>`;
        return;
    }

    state.submissions.forEach(sub => {
        const answeredCount = Object.keys(sub.answers || {}).length;
        const totalCount = state.survey.questions.length;
        const formattedDate = new Date(sub.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/50 transition-colors";
        tr.innerHTML = `
            <td class="py-3 px-4 font-semibold text-white">${sub.studentName}</td>
            <td class="py-3 px-4"><span class="bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded font-mono">${answeredCount} / ${totalCount}</span></td>
            <td class="py-3 px-4 text-slate-400">${formattedDate}</td>
            <td class="py-3 px-4 text-right">
                <span class="px-2 py-0.5 rounded-full ${answeredCount >= totalCount ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'} font-medium">
                    ${answeredCount >= totalCount ? 'Completo' : 'En Progreso'}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

export function openEditSurveyModal() {
    protectedAction(() => {
        const titleElem = document.getElementById('editSessionTitle');
        if (titleElem) titleElem.value = state.survey.title;
        renderQuestionsEditor();
        const modal = document.getElementById('editSurveyModal');
        if (modal) modal.classList.remove('hidden');
    });
}

export function closeEditSurveyModal() {
    const modal = document.getElementById('editSurveyModal');
    if (modal) modal.classList.add('hidden');
}

export function syncEditorStateToData() {
    state.survey.questions.forEach((q, qIdx) => {
        const textElem = document.getElementById(`edit_q_text_${qIdx}`);
        if (textElem) q.text = textElem.value;

        const updatedOptions = [];
        let oIdx = 0;
        while (true) {
            const optElem = document.getElementById(`edit_q_opt_${qIdx}_${oIdx}`);
            if (!optElem) break;
            updatedOptions.push(optElem.value);
            oIdx++;
        }
        if (updatedOptions.length > 0) q.options = updatedOptions;

        const correctElem = document.getElementById(`edit_q_correct_${qIdx}`);
        if (correctElem) q.correctAnswer = correctElem.value || null;

        const expElem = document.getElementById(`edit_q_explanation_${qIdx}`);
        if (expElem) q.explanation = expElem.value || null;
    });
}

export function renderQuestionsEditor() {
    const container = document.getElementById('questionsEditorContainer');
    if (!container) return;
    container.innerHTML = '';

    state.survey.questions.forEach((q, qIdx) => {
        const qDiv = document.createElement('div');
        qDiv.className = "bg-slate-900 border border-slate-700/80 rounded-xl p-5 space-y-4 shadow-md";

        let optionsHTML = q.options.map((opt, oIdx) => `
            <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-bold text-slate-400 w-5">${String.fromCharCode(65 + oIdx)})</span>
                <input type="text" value="${opt.replace(/"/g, '&quot;')}" id="edit_q_opt_${qIdx}_${oIdx}" class="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500">
                <button type="button" onclick="removeOptionField(${qIdx}, ${oIdx})" class="text-xs text-red-400 hover:text-red-300 p-1" title="Eliminar opción">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `).join('');

        let correctOptionsHTML = `<option value="">-- Sin respuesta correcta (ej. Escala de Certeza) --</option>`;
        q.options.forEach((opt) => {
            const isSel = (q.correctAnswer === opt) ? 'selected' : '';
            correctOptionsHTML += `<option value="${opt.replace(/"/g, '&quot;')}" ${isSel}>${opt}</option>`;
        });

        qDiv.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                <span class="text-xs font-bold text-indigo-400 uppercase tracking-wider">Pregunta #${qIdx + 1}</span>
                <button type="button" onclick="removeQuestionField(${qIdx})" class="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-medium">
                    <i data-lucide="trash" class="w-3.5 h-3.5"></i> Eliminar Pregunta
                </button>
            </div>
            <div>
                <label class="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Enunciado de la Pregunta</label>
                <input type="text" value="${q.text.replace(/"/g, '&quot;')}" id="edit_q_text_${qIdx}" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500">
            </div>
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <label class="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Opciones de Respuesta</label>
                    <button type="button" onclick="addOptionField(${qIdx})" class="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1">
                        <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Añadir Opción
                    </button>
                </div>
                <div class="space-y-2">${optionsHTML}</div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                    <label class="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Respuesta Correcta</label>
                    <select id="edit_q_correct_${qIdx}" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500">${correctOptionsHTML}</select>
                </div>
                <div>
                    <label class="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Retroalimentación / Explicación</label>
                    <textarea id="edit_q_explanation_${qIdx}" rows="2" placeholder="Justificación teórica o retroalimentación..." class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500">${q.explanation || ''}</textarea>
                </div>
            </div>
        `;
        container.appendChild(qDiv);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function addOptionField(qIdx) {
    syncEditorStateToData();
    if (state.survey.questions[qIdx]) {
        const num = state.survey.questions[qIdx].options.length + 1;
        state.survey.questions[qIdx].options.push(`Opción ${num}`);
        renderQuestionsEditor();
    }
}

export function removeOptionField(qIdx, oIdx) {
    syncEditorStateToData();
    if (state.survey.questions[qIdx] && state.survey.questions[qIdx].options.length > 2) {
        state.survey.questions[qIdx].options.splice(oIdx, 1);
        renderQuestionsEditor();
    } else {
        showToast("Cada pregunta debe tener al menos 2 opciones.", "warning");
    }
}

export function addNewQuestionField() {
    syncEditorStateToData();
    state.survey.questions.push({
        id: `q_${Date.now()}`,
        text: "Nueva pregunta de prueba",
        type: "multiple",
        options: ["1) Opción A", "2) Opción B", "3) Opción C"],
        correctAnswer: null,
        explanation: null
    });
    renderQuestionsEditor();
}

export function removeQuestionField(idx) {
    syncEditorStateToData();
    if (state.survey.questions.length <= 2) {
        showToast("Se requieren al menos 2 preguntas para la estructura de bloques.", "warning");
        return;
    }
    state.survey.questions.splice(idx, 1);
    renderQuestionsEditor();
}

export function saveSurveyChanges(onRender) {
    const titleElem = document.getElementById('editSessionTitle');
    if (titleElem && titleElem.value.trim()) {
        state.survey.title = titleElem.value.trim();
    }

    state.survey.questions.forEach((q, qIdx) => {
        const textElem = document.getElementById(`edit_q_text_${qIdx}`);
        if (textElem && textElem.value.trim()) q.text = textElem.value.trim();

        const updatedOptions = [];
        let oIdx = 0;
        while (true) {
            const optElem = document.getElementById(`edit_q_opt_${qIdx}_${oIdx}`);
            if (!optElem) break;
            if (optElem.value.trim()) updatedOptions.push(optElem.value.trim());
            oIdx++;
        }
        if (updatedOptions.length >= 2) q.options = updatedOptions;

        const correctElem = document.getElementById(`edit_q_correct_${qIdx}`);
        if (correctElem) q.correctAnswer = correctElem.value ? correctElem.value : null;

        const expElem = document.getElementById(`edit_q_explanation_${qIdx}`);
        if (expElem) q.explanation = expElem.value.trim() ? expElem.value.trim() : null;
    });

    saveStateToStorage(true);
    closeEditSurveyModal();
    if (onRender) onRender();
    showToast("Encuesta, respuestas y retroalimentación guardadas", "success");
}