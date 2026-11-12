const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['polling', 'websocket'],
    allowEIO3: true
});

app.use(express.static(path.join(__dirname, './')));

// Encuesta por defecto para salas nuevas
const DEFAULT_SURVEY = {
    title: "Conceptos Fundamentales de Física y Termodinámica",
    activeBlock: 0,
    questionsPerBlock: 2,
    questions: [
        {
            id: "q1",
            text: "Se abre una válvula permitiendo que un gas ideal se expanda libremente hacia un recipiente al vacío adyacente que está aislado térmicamente. Durante esta expansión libre, ¿qué ocurre con la temperatura del gas?",
            type: "multiple",
            options: ["1) Aumenta.", "2) Disminuye.", "3) Permanece igual."],
            correctAnswer: "3) Permanece igual.",
            explanation: "Al expandirse hacia el vacío no hay fuerza opositora (W = 0). Al estar aislado térmicamente (Q = 0). Por la Primera Ley (ΔU = Q - W = 0). En un gas ideal, U depende únicamente de T, por lo que ΔT = 0."
        },
        {
            id: "q2",
            text: "Nivel de certeza de su respuesta:",
            type: "multiple",
            options: ["Total incertidumbre", "Baja certeza", "Certeza media", "Certeza alta", "Total certeza"],
            correctAnswer: null,
            explanation: null
        }
    ]
};

// Diccionario global de salas activas en RAM: { "ROOM_CODE": { surveyData, submissions, activeStudents } }
const rooms = {};

// Helper para obtener o crear una sala
function getOrCreateRoom(roomCode) {
    const code = (roomCode || 'GENERAL').toUpperCase().trim();
    if (!rooms[code]) {
        rooms[code] = {
            surveyData: JSON.parse(JSON.stringify(DEFAULT_SURVEY)),
            submissions: [],
            activeStudents: []
        };
    }
    return code;
}

io.on('connection', (socket) => {
    console.log(`[Socket] Cliente conectado: ${socket.id}`);

    // Unirse a una sala específica
    socket.on('join_room', ({ roomCode, studentData }) => {
        const room = getOrCreateRoom(roomCode);
        socket.roomCode = room;
        socket.join(room);

        if (studentData && studentData.id) {
            socket.studentData = studentData;
            const roomStudents = rooms[room].activeStudents;
            const index = roomStudents.findIndex(s => s.id === studentData.id);
            if (index === -1) {
                roomStudents.push(studentData);
            } else {
                roomStudents[index] = studentData;
            }
        }

        // Emitir estado inicial ÚNICAMENTE al cliente que entra a esta sala
        socket.emit('init_state', rooms[room]);

        // Notificar al resto de la sala sobre la lista de participantes actualizada
        io.to(room).emit('poll_state_updated', rooms[room]);
    });

    // Actualización de estado de la encuesta o respuestas dentro de la sala
    socket.on('update_poll_state', (data) => {
        const room = socket.roomCode;
        if (!room || !rooms[room]) return;

        const currentRoom = rooms[room];

        if (data.surveyData) {
            if (currentRoom.surveyData && currentRoom.surveyData.questions) {
                data.surveyData.questions.forEach((q, idx) => {
                    const existingQ = currentRoom.surveyData.questions[idx];
                    if (existingQ) {
                        if (!q.correctAnswer && existingQ.correctAnswer) q.correctAnswer = existingQ.correctAnswer;
                        if (!q.explanation && existingQ.explanation) q.explanation = existingQ.explanation;
                    }
                });
            }
            currentRoom.surveyData = data.surveyData;
        }

        if (data.submissions) {
            currentRoom.submissions = data.submissions;
        }

        // Emitir ÚNICAMENTE a los dispositivos conectados a esta sala
        io.to(room).emit('poll_state_updated', currentRoom);
    });

    // Reiniciar respuestas de una sala
    socket.on('reset_poll_data', () => {
        const room = socket.roomCode;
        if (room && rooms[room]) {
            rooms[room].submissions = [];
            if (rooms[room].surveyData) rooms[room].surveyData.activeBlock = 0;
            io.to(room).emit('poll_state_updated', rooms[room]);
        }
    });

    socket.on('disconnect', () => {
        const room = socket.roomCode;
        if (room && rooms[room] && socket.studentData) {
            rooms[room].activeStudents = rooms[room].activeStudents.filter(s => s.id !== socket.studentData.id);
            io.to(room).emit('poll_state_updated', rooms[room]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Multi-Sala Activo en http://localhost:${PORT}`);
});