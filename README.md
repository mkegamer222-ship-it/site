# 💬 Chat App v3

Chat em tempo real com painel admin completo.

## Rodar

```bash
npm install
npm start
# http://localhost:3000
```

## Admin
- Usuário: `kdss`  
- Senha: `teste1`

## Funcionalidades

**Salas**
- Admin cria salas com nome + senha
- Cor única por sala (gerada do nome)
- Histórico das últimas 80 mensagens ao entrar
- Admin pode excluir salas (desconecta todos)

**Chat**
- Mensagens em tempo real via WebSocket
- Reações com emoji (clique direito ou duplo-clique no bubble)
- Responder mensagem (duplo clique → reply bar)
- Mencionar usuários com @nome (destaque em verde)
- Clicar na mensagem para copiar
- Indicador de digitação com nomes
- Detecta nome duplicado na sala
- Sidebar de membros online
- Botão de silenciar notificações (com beep sonoro)
- Anúncios do admin aparecem em destaque

**Admin Panel**
- Stats: salas, usuários online, total de mensagens
- Criar/excluir salas
- Enviar anúncio para qualquer sala
- Ver membros ativos e senha de cada sala
