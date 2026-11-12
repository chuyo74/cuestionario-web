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

// Almacén global de salas en memoria RAM: { "CODIGO_SALA": { code, surveyData, submissions, activeStudents } }
const rooms = {};

io.on('connection', (socket) => {
    console.log(`[Socket] Cliente conectado: ${socket.id}`);

    // 1. CREAR SALA (Exclusivo Docente)
    socket.on('create_room', ({ roomCode }) => {
        const code = (roomCode || '').toUpperCase().trim();

        if (!code) {
            socket.emit('room_error', { message: 'Debes proporcionar un código de sala válido.' });
            return;
        }

        // Validación de duplicados
        if (rooms[code]) {
            socket.emit('room_error', { 
                message: `El nombre de sala "${code}" ya existe. Por favor elige o genera otro nombre.` 
            });
            return;
        }

        // Crear nueva sala
        rooms[code] = {
            code: code,
            surveyData: JSON.parse(JSON.stringify(DEFAULT_SURVEY)),
            submissions: [],
            activeStudents: []
        };
        console.log(`[Sala Creada] Profesor creó la sala: ${code}`);

        socket.roomCode = code;
        socket.join(code);
        socket.emit('init_state', rooms[code]);
    });

    // 2. UNIRSE A UNA SALA EXISTENTE (Estudiantes o Reconexión Docente)
    socket.on('join_room', ({ roomCode, role, studentData }) => {
        const code = (roomCode || '').toUpperCase().trim();

        if (!code) {
            socket.emit('room_error', { message: 'Debes ingresar el código de la sala.' });
            return;
        }

        // Validar que la sala exista
        if (!rooms[code]) {
            socket.emit('room_error', { 
                message: `La sala "${code}" no existe o el profesor aún no la ha creado.` 
            });
            return;
        }

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

    // 3. ELIMINAR SALA EXISTENTE
    socket.on('delete_room', ({ roomCode }) => {
        const code = (roomCode || '').toUpperCase().trim();

        if (rooms[code]) {
            io.to(code).emit('room_error', { 
                message: `La sala "${code}" ha sido cerrada y eliminada por el profesor.` 
            });
            io.in(code).socketsLeave(code);
            delete rooms[code];
            console.log(`[Sala Eliminada] ${code}`);
        } else {
            socket.emit('room_error', { message: `La sala "${code}" no existe.` });
        }
    });

    // 4. ACTUALIZAR ESTADO DE ENCUESTA / RESPUESTAS
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

        io.to(room).emit('poll_state_updated', currentRoom);
    });

    // 5. REINICIAR RESPUESTAS EN LA SALA
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