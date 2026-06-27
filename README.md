# 💬 Chat App v2

Chat em tempo real com painel administrativo.

## Como rodar

```bash
npm install
npm start
```

Acesse **http://localhost:3000**

## Credenciais Admin

- **Usuário:** `kdss`
- **Senha:** `teste1`

## Fluxo

1. Admin faz login em "Área do administrador" e cria salas (nome + senha)
2. Usuários veem as salas disponíveis no lobby
3. Para entrar numa sala: nome + senha da sala
4. Chat em tempo real com WebSocket

## Tecnologias

- Node.js + Express + Socket.io
- HTML/CSS/JS puro (sem frameworks)
