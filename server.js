const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const onlineUsers = new Map(); // socketId -> name

io.on("connection", (socket) => {
  console.log("Novo usuário conectado:", socket.id);

  socket.on("join", (name) => {
    onlineUsers.set(socket.id, name);
    io.emit("user_joined", { name, count: onlineUsers.size });
    socket.emit("online_count", onlineUsers.size);
  });

  socket.on("message", ({ name, text }) => {
    const timestamp = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    io.emit("message", { name, text, timestamp });
  });

  socket.on("typing", (name) => {
    socket.broadcast.emit("typing", name);
  });

  socket.on("stop_typing", () => {
    socket.broadcast.emit("stop_typing");
  });

  socket.on("disconnect", () => {
    const name = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    if (name) {
      io.emit("user_left", { name, count: onlineUsers.size });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
