const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());
app.use(cors()); // Permite que o seu index.html acesse esta API

// ==========================================
// 1. CONFIGURAÇÃO DA INTELIGÊNCIA ARTIFICIAL
// ==========================================
// Cole aqui a sua chave gerada na Etapa 1 dentro das aspas
const openai = new OpenAI({
  apiKey: "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", 
});

// ==========================================
// 2. CONEXÃO COM O BANCO DE DADOS MONGO DB
// ==========================================
mongoose.connect('mongodb+srv://driftask_user:I9UdoO79FYymDeGJ@driftask.bugwepi.mongodb.net/?appName=DrifTask')
  .then(() => console.log('MongoDB e Rotas de IA inicializados com sucesso!'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// Definição do Molde (Schema) da tarefa para o MongoDB
const TaskSchema = new mongoose.Schema({
  id: String,
  text: String,
  notes: String,
  col: String,
  priority: String,
  profile: String,
  date: String,
  due: String
});
const Task = mongoose.model('Task', TaskSchema);

// ==========================================
// 3. ROTAS PADRÃO DO BANCO DE DADOS (CRUD)
// ==========================================

// Buscar todas as tarefas do banco
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar ou Atualizar uma tarefa existente
app.post('/api/tasks', async (req, res) => {
  try {
    const { id } = req.body;
    const task = await Task.findOneAndUpdate({ id }, req.body, { new: true, upsert: true });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar uma tarefa do banco pelo ID
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await Task.deleteOne({ id: req.params.id });
    res.json({ message: 'Tarefa eliminada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. NOVA ROTA: COMUNICAÇÃO COM A IA
// ==========================================
app.post('/api/ai', async (req, res) => {
  const { message, tasksContext, currentColumn } = req.body;

  try {
    // Enviamos a pergunta e as regras para o ChatGPT decidir o que fazer
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Modelo super rápido e optimizado
      messages: [
        {
          role: "system",
          content: `Você é o assistente inteligente do sistema Driftask.
          Contexto atual de tarefas salvas no banco: ${JSON.stringify(tasksContext)}.
          Coluna visual selecionada no chat: "${currentColumn}".

          Regras estritas de resposta:
          1. Se o usuário mandar uma mensagem pedindo para criar, adicionar ou anotar uma nova tarefa, você deve identificar o título da tarefa e responder APENAS com o texto no formato "CRIAR: [Título da tarefa]". Não coloque pontos adicionais nem saudações. Exemplo: "CRIAR: Comprar pão doce".
          2. Se o usuário fizer uma pergunta genérica, pedir dicas de organização ou análise das tarefas dele, responda amigavelmente em português, de forma breve (máximo 3 frases).`
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.4, // Mantém as respostas focadas e menos criativas/aleatórias
    });

    const aiResponseText = response.choices[0].message.content.trim();
    res.json({ text: aiResponseText });

  } catch (error) {
    console.error("Erro interno no motor da OpenAI:", error);
    res.status(500).json({ error: "Falha ao processar a resposta da Inteligência Artificial." });
  }
});

// Inicializar o servidor na porta 3000
const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor a rodar na porta http://localhost:${PORT}`));
