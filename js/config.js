/*
Almacena las constantes inmutables y la estructura de datos predeterminada de la encuesta.
*/
export const CONFIG = Object.freeze({
    STORAGE_KEYS: {
        SURVEY: 'classpoll_survey_v4',
        SUBMISSIONS: 'classpoll_submissions_v4',
        STUDENT: 'classpoll_current_student_v4'
    },
    TEACHER_PIN: '1234',
    DEFAULT_QUESTIONS_PER_BLOCK: 2,
    SYNC_CHANNEL: 'classpoll_live_sync'
});

export const DEFAULT_SURVEY = {
    title: "Conceptos Fundamentales de Física y Termodinámica",
    activeBlock: 0,
    questionsPerBlock: CONFIG.DEFAULT_QUESTIONS_PER_BLOCK,
    questions: [
        {
            id: "q1",
            text: "Se abre una válvula permitiendo que un gas ideal se expanda libremente hacia un recipiente al vacío adyacente que está aislado térmicamente. Durante esta expansión libre, ¿qué ocurre con la temperatura del gas?",
            type: "multiple",
            options: [
                "1) Aumenta.",
                "2) Disminuye.",
                "3) Permanece igual."
            ],
            correctAnswer: "3) Permanece igual.",
            explanation: "Al expandirse hacia el vacío no hay fuerza opositora (W = 0). Al estar aislado térmicamente (Q = 0). Por la Primera Ley (ΔU = Q - W = 0). En un gas ideal, U depende únicamente de T, por lo que ΔT = 0."
        },
        {
            id: "q2",
            text: "Nivel de certeza de su respuesta:",
            type: "multiple",
            options: [
                "Total incertidumbre",
                "Baja certeza",
                "Certeza media",
                "Certeza alta",
                "Total certeza"
            ],
            correctAnswer: null,
            explanation: null
        },
        {
            id: "q3",
            text: "Un gas realiza un ciclo termodinámico cerrado en un diagrama P-V compuesto por una expansión a alta presión seguida de una compresión a baja presión (sentido horario). ¿Cuál es el signo del trabajo neto realizado por el gas?",
            type: "multiple",
            options: [
                "1) Positivo.",
                "2) Negativo.",
                "3) Cero."
            ],
            correctAnswer: "1) Positivo.",
            explanation: "El trabajo es el área bajo la curva. La expansión a alta presión aporta trabajo positivo mayor que el trabajo negativo de la compresión a baja presión. El área encerrada en sentido horario representa un trabajo neto positivo."
        },
        {
            id: "q4",
            text: "Nivel de certeza de su respuesta:",
            type: "multiple",
            options: [
                "Total incertidumbre",
                "Baja certeza",
                "Certeza media",
                "Certeza alta",
                "Total certeza"
            ],
            correctAnswer: null,
            explanation: null
        }
    ]
};