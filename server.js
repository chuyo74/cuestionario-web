const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Habilitar transportes con fallback para garantizar compatibilidad móvil en Render
    transports: ['polling', 'websocket'],
    allowEIO3: true
});

// Servir los archivos estáticos de la aplicación (index.html, styles.css, app.js)
app.use(express.static(path.join(__dirname, './')));

// Estado de la encuesta guardado en memoria del servidor
let surveyState = {
    surveyData: null,
    submissions: [],
    activeStudents: []
};

io.on('connection', (socket) => {
    console.log(`[Socket] Nuevo cliente conectado: ${socket.id}`);

    // Enviar el estado actual apenas se conecta un alumno o profesor
    socket.emit('init_state', surveyState);

    // Registrar inicio de sesión del estudiante y sincronizar presencia
    socket.on('student_joined', (studentData) => {
        if (studentData && studentData.id) {
            socket.studentData = studentData;
            // Evitar duplicados por ID
            const index = surveyState.activeStudents.findIndex(s => s.id === studentData.id);
            if (index === -1) {
                surveyState.activeStudents.push(studentData);
            } else {
                surveyState.activeStudents[index] = studentData;
            }
            console.log(`[Socket] Estudiante activo: ${studentData.name} (${studentData.id})`);
        }
        // Emitir a TODOS los clientes conectados el estado de presencia actualizado
        io.emit('poll_state_updated', surveyState);
    });

    // Cuando el profesor cambia de bloque o un alumno responde
    socket.on('update_poll_state', (data) => {
        // Si viene información de encuesta, fusionar sin perder respuestas correctas
        if (data.surveyData) {
            if (surveyState.surveyData && surveyState.surveyData.questions) {
                data.surveyData.questions.forEach((q, idx) => {
                    const existingQ = surveyState.surveyData.questions[idx];
                    if (existingQ) {
                        if (!q.correctAnswer && existingQ.correctAnswer) q.correctAnswer = existingQ.correctAnswer;
                        if (!q.explanation && existingQ.explanation) q.explanation = existingQ.explanation;
                    }
                });
            }
            surveyState.surveyData = data.surveyData;
        }

        // Actualizar lista de respuestas si vienen en el payload
        if (data.submissions) {
            surveyState.submissions = data.submissions;
        }
        
        // Transmitir inmediatamente a todos los clientes
        io.emit('poll_state_updated', surveyState);
    });

    // Reiniciar respuestas (acción protegida docente)
    socket.on('reset_poll_data', () => {
        surveyState.submissions = [];
        if (surveyState.surveyData) surveyState.surveyData.activeBlock = 0;
        io.emit('poll_state_updated', surveyState);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Cliente desconectado: ${socket.id}`);
        if (socket.studentData) {
            surveyState.activeStudents = surveyState.activeStudents.filter(s => s.id !== socket.studentData.id);
            io.emit('poll_state_updated', surveyState);
        }
    });
});

const PORT = process.env.PORT || 3000;
// Escuchar explícitamente en '0.0.0.0' para permitir conexiones desde celulares en la red local
server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` Servidor de Encuestas Multiusuario Activo`);
    console.log(` Puerto: http://localhost:${PORT}`);
    console.log(` Escuchando en todas las interfaces de red (0.0.0.0)`);
    console.log(`====================================================`);
});