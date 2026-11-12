/*
Administra el estado en memoria de la aplicación y las funciones utilitarias de segmentación por bloques.
*/
import { CONFIG, DEFAULT_SURVEY } from './config.js';

export function enrichSurveyWithMetadata(survey) {
    if (!survey || !survey.questions) return survey;
    survey.questions.forEach((q, idx) => {
        const defaultQ = DEFAULT_SURVEY.questions[idx];
        if (defaultQ) {
            if (!q.correctAnswer && defaultQ.correctAnswer) {
                q.correctAnswer = defaultQ.correctAnswer;
            }
            if (!q.explanation && defaultQ.explanation) {
                q.explanation = defaultQ.explanation;
            }
        }
    });
    return survey;
}

export const state = {
    survey: enrichSurveyWithMetadata(JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SURVEY)) || DEFAULT_SURVEY),
    submissions: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SUBMISSIONS)) || [],
    activeStudents: [],
    currentStudent: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.STUDENT)) || null,
    currentRole: 'student',
    isTeacherAuthenticated: false,
    revealedAnswers: {},
    chartInstances: {}
};

export const SurveyUtils = {
    getQuestionsPerBlock: () => state.survey.questionsPerBlock || CONFIG.DEFAULT_QUESTIONS_PER_BLOCK,
    
    getTotalBlocks: () => {
        const qpb = SurveyUtils.getQuestionsPerBlock();
        return Math.ceil(state.survey.questions.length / qpb) || 1;
    },

    getCurrentBlockQuestions: () => {
        const qpb = SurveyUtils.getQuestionsPerBlock();
        const start = state.survey.activeBlock * qpb;
        return state.survey.questions.slice(start, start + qpb);
    }
};