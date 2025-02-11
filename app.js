const express = require("express");
const cors = require("cors");

const app = express();
const port = 3001; // A porta que o servidor vai rodar

// Usar o CORS para permitir que seu frontend acesse a API
app.use(cors());
app.use(express.json());

// Rota para retornar quizzes (exemplo)
app.get("/api/quizzes", (req, res) => {
  const quizzes = [
    { id: 1, title: "Quiz 1" },
    { id: 2, title: "Quiz 2" },
  ];
  res.json(quizzes);
});

// Rota para criar um novo quiz (exemplo)
app.post("/api/quizzes", (req, res) => {
  const { title } = req.body;
  const newQuiz = { id: Date.now(), title };
  res.status(201).json(newQuiz);
});

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na http://localhost:${port}`);
});
