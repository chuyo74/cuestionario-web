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

    // Registrar inicio de sesión del estudiante
    socket.on('student_joined', (studentData) => {
        socket.studentData = studentData;
        if (studentData && studentData.id) {
            const exists = surveyState.activeStudents.some(s => s.id === studentData.id);
            if (!exists) {
                surveyState.activeStudents.push(studentData);
            }
        }
        // Emitir a TODOS los clientes conectados
        io.emit('poll_state_updated', surveyState);
    });

    // Cuando el profesor cambia de bloque o un alumno responde
    socket.on('update_poll_state', (data) => {
        if (data.surveyData) surveyState.surveyData = data.surveyData;
        if (data.submissions) surveyState.submissions = data.submissions;
        
        // Transmitir forzadamente a TODOS los clientes
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