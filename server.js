const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Admin credentials ──
const ADMIN_USER = "kdss";
const ADMIN_PASS = "teste1";

// ── In-memory store ──
// rooms: { [id]: { id, name, password, createdAt, online: Set<socketId> } }
const rooms = new Map();

function makeId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── Admin REST API ──

// Login
app.post("/api/admin/login", (req, res) => {
  const { user, pass } = req.body;
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: "Credenciais inválidas" });
});

// List rooms
app.get("/api/admin/rooms", (req, res) => {
  const { user, pass } = req.query;
  if (user !== ADMIN_USER || pass !== ADMIN_PASS)
    return res.status(401).json({ error: "Não autorizado" });

  const list = [...rooms.values()].map((r) => ({
    id: r.id,
    name: r.name,
    password: r.password,
    createdAt: r.createdAt,
    online: r.online.size,
  }));
  res.json(list);
});

// Create room
app.post("/api/admin/rooms", (req, res) => {
  const { user, pass, name, password } = req.body;
  if (user !== ADMIN_USER || pass !== ADMIN_PASS)
    return res.status(401).json({ error: "Não autorizado" });
  if (!name || !password)
    return res.status(400).json({ error: "Nome e senha são obrigatórios" });

  const id = makeId();
  rooms.set(id, { id, name, password, createdAt: new Date().toISOString(), online: new Set() });
  io.emit("rooms_updated");
  res.json({ ok: true, id });
});

// Delete room
app.delete("/api/admin/rooms/:id", (req, res) => {
  const { user, pass } = req.query;
  if (user !== ADMIN_USER || pass !== ADMIN_PASS)
    return res.status(401).json({ error: "Não autorizado" });

  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "Sala não encontrada" });

  rooms.delete(req.params.id);
  io.to(req.params.id).emit("room_deleted");
  io.emit("rooms_updated");
  res.json({ ok: true });
});

// Public: list rooms (name + id only, no password)
app.get("/api/rooms", (req, res) => {
  const list = [...rooms.values()].map((r) => ({
    id: r.id,
    name: r.name,
    online: r.online.size,
  }));
  res.json(list);
});

// ── Socket.io ──
io.on("connection", (socket) => {
  let currentRoom = null;
  let currentName = null;

  // Join a room
  socket.on("join_room", ({ roomId, password, name }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb({ ok: false, error: "Sala não encontrada" });
    if (room.password !== password) return cb({ ok: false, error: "Senha incorreta" });

    currentRoom = roomId;
    currentName = name;
    socket.join(roomId);
    room.online.add(socket.id);

    io.to(roomId).emit("user_joined", { name, count: room.online.size });
    cb({ ok: true, roomName: room.name });
  });

  socket.on("message", ({ text }) => {
    if (!currentRoom || !currentName) return;
    const timestamp = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    io.to(currentRoom).emit("message", { name: currentName, text, timestamp });
  });

  socket.on("typing", () => {
    if (!currentRoom || !currentName) return;
    socket.to(currentRoom).emit("typing", currentName);
  });

  socket.on("stop_typing", () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("stop_typing");
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      room.online.delete(socket.id);
      io.to(currentRoom).emit("user_left", { name: currentName, count: room.online.size });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}`));
