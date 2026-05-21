# Driftask 🚀
**Your flow, your pace** — Kanban board com autenticação, MongoDB Atlas e deploy no Vercel.

---

## 📁 Estrutura do Projeto

```
driftask/
├── public/
│   └── index.html          ← Frontend completo (HTML + CSS + JS)
├── api/
│   ├── auth.js             ← POST /api/auth  (register | login)
│   └── tasks.js            ← GET/POST /api/tasks (tarefas do usuário)
├── lib/
│   └── mongodb.js          ← Conexão singleton com MongoDB
├── .env.example            ← Template de variáveis de ambiente
├── .gitignore
├── package.json
├── vercel.json             ← Configuração de deploy (rotas + headers)
└── README.md
```

---

## ⚙️ Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| Node.js | 18.x |
| npm | 8.x |
| Conta Vercel | gratuita |
| Conta MongoDB Atlas | gratuita (M0) |

---

## 🛠️ Deploy Passo a Passo

### 1. Clone e instale dependências

```bash
git clone https://github.com/SEU_USUARIO/driftask.git
cd driftask
npm install
```

### 2. Configure o MongoDB Atlas

1. Acesse [cloud.mongodb.com](https://cloud.mongodb.com) e crie uma conta
2. Crie um **Cluster gratuito (M0)**
3. Em **Database Access** → crie um usuário com senha
4. Em **Network Access** → adicione `0.0.0.0/0` (permite acesso do Vercel)
5. Em **Connect → Drivers → Node.js** → copie a **Connection String**

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` com suas credenciais reais:

```env
MONGODB_URI=mongodb+srv://usuario:senha@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=driftask
JWT_SECRET=sua_string_secreta_longa_aqui
JWT_EXPIRES=30d
```

> **Gere um JWT_SECRET seguro:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### 4. Rode localmente

```bash
npm install -g vercel   # instala CLI (se ainda não tiver)
vercel dev              # sobe servidor local em http://localhost:3000
```

### 5. Deploy no Vercel

#### Via CLI (recomendado)
```bash
vercel login
vercel --prod
```
Durante o processo, o CLI perguntará as variáveis de ambiente — insira os mesmos valores do `.env.local`.

#### Via Dashboard (alternativa)
1. Faça push para o GitHub
2. Acesse [vercel.com/new](https://vercel.com/new)
3. Importe o repositório
4. Em **Environment Variables** adicione:
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `JWT_SECRET`
   - `JWT_EXPIRES`
5. Clique em **Deploy**

---

## 🔐 Regras de Autenticação

| Funcionalidade | Comportamento |
|---|---|
| **Cadastro** | Aceita **somente e-mail válido** completo (ex: `joao@gmail.com`) |
| **Login — e-mail completo** | Aceita o e-mail exato cadastrado |
| **Login — prefixo** | Aceita apenas a primeira parte do e-mail (ex: `joao` → encontra `joao@gmail.com`) |
| **Acesso negado** | Exibe painel vermelho com opção de cadastro ou nova tentativa |
| **Senha** | Mínimo 6 caracteres; armazenada como hash bcrypt (12 rounds) |
| **Sessão** | JWT com expiração configurável (padrão: 30 dias) |

---

## 🗄️ Coleções MongoDB

### `users`
```json
{
  "_id": "ObjectId",
  "email": "joao@gmail.com",
  "password": "$2a$12$hash...",
  "createdAt": "ISODate",
  "lastLogin": "ISODate"
}
```
**Índice:** `{ email: 1 }` — unique

### `tasks`
```json
{
  "_id": "ObjectId",
  "userId": "string (ref users._id)",
  "tasks": [ /* array de tarefas */ ],
  "updatedAt": "ISODate"
}
```
**Índice:** `{ userId: 1 }`

---

## 🌐 Endpoints da API

### `POST /api/auth`

**Cadastro:**
```json
{ "action": "register", "email": "joao@gmail.com", "password": "minhasenha" }
```

**Login por e-mail:**
```json
{ "action": "login", "email": "joao@gmail.com", "password": "minhasenha" }
```

**Login por prefixo:**
```json
{ "action": "login", "emailPrefix": "joao", "password": "minhasenha" }
```

### `GET /api/tasks`
Header: `Authorization: Bearer <token>`

### `POST /api/tasks`
Header: `Authorization: Bearer <token>`
```json
{ "tasks": [ { "id": "...", "text": "...", "col": "todo", ... } ] }
```

---

## 📜 Licença
MIT — use à vontade!
