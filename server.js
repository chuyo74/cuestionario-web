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
    }
});

// Servir los archivos estáticos de la aplicación (index.html, styles.css, app.js)
app.use(express.static(path.join(__dirname, './')));

// Estado de la encuesta guardado en memoria del servidor
let surveyState = {
    surveyData: null,
    submissions: []
};

io.on('connection', (socket) => {
    console.log(`[Socket] Nuevo cliente conectado: ${socket.id}`);

    // Enviar el estado actual apenas se conecta un alumno o profesor
    socket.emit('init_state', surveyState);

    // Cuando el profesor cambia de bloque o un alumno responde
    socket.on('update_poll_state', (data) => {
        if (data.surveyData) surveyState.surveyData = data.surveyData;
        if (data.submissions) surveyState.submissions = data.submissions;
        
        // Transmitir inmediatamente a TODOS los dispositivos conectados
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