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

// Almacén global de salas en RAM: { "CODIGO": { code, surveyData, submissions, activeStudents, lastActivity } }
const rooms = {};

// Tiempo de inactividad permitido: 36 horas en milisegundos
const INACTIVITY_TIMEOUT_MS = 36 * 60 * 60 * 1000;

// RECOLECTOR DE BASURA PERIÓDICO (Ejecutado cada 1 hora)
setInterval(() => {
    const now = Date.now();
    for (const code in rooms) {
        if (now - rooms[code].lastActivity > INACTIVITY_TIMEOUT_MS) {
            console.log(`[Auto-Purga] Eliminando sala "${code}" por inactividad superior a 36 horas.`);
            
            // Notificar y expulsar posibles clientes conectados
            io.to(code).emit('room_error', { 
                message: `La sala "${code}" ha sido eliminada automáticamente tras 36 horas de inactividad.` 
            });
            io.in(code).socketsLeave(code);

            // Eliminar de memoria
            delete rooms[code];
        }
    }
}, 60 * 60 * 1000); // Chequeo cada 60 minutos

io.on('connection', (socket) => {
    console.log(`[Socket] Cliente conectado: ${socket.id}`);

    // 1. CREAR SALA (Exclusivo Docente)
    socket.on('create_room', ({ roomCode }) => {
        const code = (roomCode || '').toUpperCase().trim();

        if (!code) {
            socket.emit('room_error', { message: 'Debes proporcionar un código de sala válido.' });
            return;
        }

        if (rooms[code]) {
            socket.emit('room_error', { 
                message: `El nombre de sala "${code}" ya existe. Por favor elige o genera otro nombre.` 
            });
            return;
        }

        rooms[code] = {
            code: code,
            surveyData: JSON.parse(JSON.stringify(DEFAULT_SURVEY)),
            submissions: [],
            activeStudents: [],
            lastActivity: Date.now() // Registrar hora de creación
        };
        console.log(`[Sala Creada] Se creó la sala: ${code}`);

        socket.roomCode = code;
        socket.join(code);
        socket.emit('init_state', rooms[code]);
    });

    // 2. UNIRSE A UNA SALA EXISTENTE
    socket.on('join_room', ({ roomCode, role, studentData }) => {
        const code = (roomCode || '').toUpperCase().trim();

        if (!code) {
            socket.emit('room_error', { message: 'Debes ingresar el código de la sala.' });
            return;
        }

        if (!rooms[code]) {
            socket.emit('room_error', { 
                message: `La sala "${code}" no existe.` 
            });
            return;
        }

        // Renovar marca de actividad
        rooms[code].lastActivity = Date.now();

        socket.roomCode = code;
        socket.join(code);

        if (role === 'student' && studentData && studentData.id) {
            socket.studentData = studentData;
            const roomStudents = rooms[code].activeStudents;
            const index = roomStudents.findIndex(s => s.id === studentData.id);
            if (index === -1) {
                roomStudents.push(studentData);
            } else {
                roomStudents[index] = studentData;
            }
        }

        socket.emit('init_state', rooms[code]);
        io.to(code).emit('poll_state_updated', rooms[code]);
    });

    // 3. ELIMINAR SALA MANUALMENTE POR EL PROFESOR
    socket.on('delete_room', ({ roomCode }) => {
        const code = (roomCode || '').toUpperCase().trim();

        if (rooms[code]) {
            io.to(code).emit('room_error', { 
                message: `La sala "${code}" ha sido cerrada y eliminada.` 
            });
            io.in(code).socketsLeave(code);
            delete rooms[code];
            console.log(`[Sala Eliminada Manualmente] ${code}`);
        } else {
            socket.emit('room_error', { message: `La sala "${code}" no existe.` });
        }
    });

    // 4. ACTUALIZAR ESTADO DE ENCUESTA / RESPUESTAS
    socket.on('update_poll_state', (data) => {
        const room = socket.roomCode;
        if (!room || !rooms[room]) return;

        const currentRoom = rooms[room];

        // Renovar marca de actividad
        currentRoom.lastActivity = Date.now();

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

        io.to(room).emit('poll_state_updated', currentRoom);
    });

    // 5. REINICIAR RESPUESTAS EN LA SALA
    socket.on('reset_poll_data', () => {
        const room = socket.roomCode;
        if (room && rooms[room]) {
            rooms[room].lastActivity = Date.now(); // Renovar marca de actividad
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