import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
})

app.use(cors())
app.use(express.json())

const quizzes = new Map()
const activeSessions = new Map()
const players = new Map()

app.post('/api/quizzes', (req, res) => {
    const { title, questions } = req.body
    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Invalid quiz data' })
    }
    const quizId = uuidv4()
    let pinCode
    do {
        pinCode = Math.floor(1000 + Math.random() * 9000).toString()
    } while (activeSessions.has(pinCode))
    const quiz = {
        id: quizId,
        title,
        questions,
        createdAt: new Date()
    }
    quizzes.set(quizId, quiz)
    const session = {
        quizId,
        pinCode,
        players: [],
        currentQuestionIndex: -1,
        started: false,
        scores: {}
    }

    activeSessions.set(pinCode, session)

    console.log(`Created quiz "${title}" with PIN: ${pinCode}`)

    res.status(201).json({
        quizId,
        pinCode
    })
})

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id)
    socket.on('join-quiz', ({ pinCode, playerName }) => {
        const session = activeSessions.get(pinCode)
        if (!session) {
            socket.emit('error', { message: 'Invalid PIN code' })
            return
        }
        if (session.started) {
            socket.emit('error', { message: 'Quiz has already started' })
            return
        }
        const playerId = uuidv4()
        const player = {
            id: playerId,
            name: playerName,
            socketId: socket.id
        }
        session.players.push(player)
        players.set(playerId, player)
        socket.join(pinCode)
        session.scores[playerId] = 0
        socket.emit('joined', {
            playerId,
            quizTitle: quizzes.get(session.quizId).title
        })
        io.to(pinCode).emit('player-joined', {
            players: session.players
        })
        console.log(`Player ${playerName} joined quiz ${pinCode}`)
    })

    socket.on('start-quiz', ({ pinCode }) => {
        const session = activeSessions.get(pinCode)
        if (!session) {
            socket.emit('error', { message: 'Invalid PIN code' })
            return
        }
        session.started = true
        session.currentQuestionIndex = 0
        const quiz = quizzes.get(session.quizId)
        const currentQuestion = quiz.questions[0]
        io.to(pinCode).emit('quiz-started')
        io.to(pinCode).emit('new-question', {
            questionIndex: 0,
            question: {
                text: currentQuestion.text,
                options: currentQuestion.options,
                timeLimit: currentQuestion.timeLimit
            }
        })
        console.log(`Quiz ${pinCode} started`)
    })
    socket.on('next-question', ({ pinCode }) => {
        const session = activeSessions.get(pinCode)
        if (!session || !session.started) {
            socket.emit('error', { message: 'Quiz not active' })
            return
        }
        const quiz = quizzes.get(session.quizId)
        session.currentQuestionIndex++

        if (session.currentQuestionIndex >= quiz.questions.length) {
            const scores = session.scores
            const playerScores = session.players
                .map((player) => ({
                    id: player.id,
                    name: player.name,
                    score: scores[player.id] || 0
                }))
                .sort((a, b) => b.score - a.score)

            io.to(pinCode).emit('quiz-ended', { playerScores })
            console.log(`Quiz ${pinCode} ended`)
        } else {
            const currentQuestion = quiz.questions[session.currentQuestionIndex]
            io.to(pinCode).emit('new-question', {
                questionIndex: session.currentQuestionIndex,
                question: {
                    text: currentQuestion.text,
                    options: currentQuestion.options,
                    timeLimit: currentQuestion.timeLimit
                }
            })
            console.log(`Quiz ${pinCode} advanced to question ${session.currentQuestionIndex + 1}`)
        }
    })
    socket.on('submit-answer', ({ playerId, pinCode, answerIndex, timeRemaining }) => {
        const session = activeSessions.get(pinCode)
        if (!session || !session.started) {
            socket.emit('error', { message: 'Quiz not active' })
            return
        }
        const quiz = quizzes.get(session.quizId)
        const currentQuestion = quiz.questions[session.currentQuestionIndex]
        const isCorrect = answerIndex === currentQuestion.correctOption
        let points = 0
        if (isCorrect) {
            points = 100
            const timePercentage = timeRemaining / currentQuestion.timeLimit
            const timeBonus = Math.floor(timePercentage * 100)
            points += timeBonus
        }
        session.scores[playerId] = (session.scores[playerId] || 0) + points
        socket.emit('answer-result', {
            isCorrect,
            correctOption: currentQuestion.correctOption,
            points,
            totalScore: session.scores[playerId]
        })
        console.log(`Player ${playerId} answered question ${session.currentQuestionIndex + 1}, got ${points} points`)
    })
    socket.on('end-quiz', ({ pinCode }) => {
        const session = activeSessions.get(pinCode)
        if (!session) {
            socket.emit('error', { message: 'Invalid PIN code' })
            return
        }
        io.to(pinCode).emit('quiz-ended', {
            message: 'The quiz has been ended by the host'
        })
        activeSessions.delete(pinCode)
        console.log(`Quiz ${pinCode} was manually ended`)
    })
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id)
        for (const [pinCode, session] of activeSessions.entries()) {
            const playerIndex = session.players.findIndex((p) => p.socketId === socket.id)
            if (playerIndex !== -1) {
                const player = session.players[playerIndex]
                session.players.splice(playerIndex, 1)
                io.to(pinCode).emit('player-left', {
                    playerId: player.id,
                    players: session.players
                })

                console.log(`Player ${player.name} left quiz ${pinCode}`)
                break
            }
        }
    })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
setInterval(() => {
    console.log(`Active sessions: ${activeSessions.size}`)
    for (const [pinCode, session] of activeSessions.entries()) {
        console.log(`- PIN ${pinCode}: ${session.players.length} players, ${session.started ? 'started' : 'waiting'}`)
    }
}, 5 * 60 * 1000)

console.log('Quiz server is running!')
