const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Admin credentials ──
const ADMIN_USER = "kdss";
const ADMIN_PASS = "teste1";

// ── In-memory store ──
const rooms = new Map();
// room shape: { id, name, password, createdAt, pinned: null|msgObj,
//               online: Map<socketId,{name,joinedAt}>, messages: [], totalMessages: 0 }

function makeId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getRoomPublic(r) {
  return { id: r.id, name: r.name, online: r.online.size, totalMessages: r.totalMessages };
}

// ── Admin REST ──
app.post("/api/admin/login", (req, res) => {
  const { user, pass } = req.body;
  if (user === ADMIN_USER && pass === ADMIN_PASS) return res.json({ ok: true });
  res.status(401).json({ ok: false, error: "Credenciais inválidas" });
});

function adminGuard(req, res) {
  const user = req.query.user || (req.body && req.body.user);
  const pass = req.query.pass || (req.body && req.body.pass);
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    res.status(401).json({ error: "Não autorizado" });
    return false;
  }
  return true;
}

app.get("/api/admin/rooms", (req, res) => {
  if (!adminGuard(req, res)) return;
  const list = [...rooms.values()].map((r) => ({
    id: r.id, name: r.name, password: r.password,
    createdAt: r.createdAt, online: r.online.size,
    totalMessages: r.totalMessages,
    members: [...r.online.values()].map(u => u.name),
  }));
  res.json(list);
});

app.post("/api/admin/rooms", (req, res) => {
  if (!adminGuard(req, res)) return;
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: "Nome e senha são obrigatórios" });
  const id = makeId();
  rooms.set(id, {
    id, name, password,
    createdAt: new Date().toISOString(),
    online: new Map(),
    messages: [],
    totalMessages: 0,
    pinned: null,
  });
  io.emit("rooms_updated");
  res.json({ ok: true, id });
});

app.delete("/api/admin/rooms/:id", (req, res) => {
  if (!adminGuard(req, res)) return;
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "Sala não encontrada" });
  rooms.delete(req.params.id);
  io.to(req.params.id).emit("room_deleted");
  io.emit("rooms_updated");
  res.json({ ok: true });
});

// Admin: pin a message
app.post("/api/admin/rooms/:id/pin", (req, res) => {
  if (!adminGuard(req, res)) return;
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "Sala não encontrada" });
  room.pinned = req.body.message || null;
  io.to(req.params.id).emit("pinned_update", room.pinned);
  res.json({ ok: true });
});

// Admin: broadcast announcement
app.post("/api/admin/rooms/:id/announce", (req, res) => {
  if (!adminGuard(req, res)) return;
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "Sala não encontrada" });
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Texto obrigatório" });
  io.to(req.params.id).emit("announcement", { text, ts: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) });
  res.json({ ok: true });
});

// Public room list
app.get("/api/rooms", (req, res) => {
  res.json([...rooms.values()].map(getRoomPublic));
});

// ── Socket.io ──
io.on("connection", (socket) => {
  let currentRoom = null;
  let currentName = null;

  socket.on("join_room", ({ roomId, password, name }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb({ ok: false, error: "Sala não encontrada" });
    if (room.password !== password) return cb({ ok: false, error: "Senha incorreta" });

    // Check duplicate name in room
    const nameInUse = [...room.online.values()].some(u => u.name.toLowerCase() === name.toLowerCase());
    if (nameInUse) return cb({ ok: false, error: "Nome já está em uso nessa sala" });

    currentRoom = roomId;
    currentName = name;
    socket.join(roomId);
    room.online.set(socket.id, { name, joinedAt: Date.now() });

    const memberList = [...room.online.values()].map(u => u.name);
    io.to(roomId).emit("member_list", memberList);
    socket.to(roomId).emit("user_joined", { name });

    cb({
      ok: true,
      roomName: room.name,
      history: room.messages.slice(-80),
      pinned: room.pinned,
      memberList,
    });

    io.emit("rooms_updated");
    io.to("admin_watch").emit("admin_stats_update");
  });

  socket.on("message", ({ text, replyTo }, cb) => {
    if (!currentRoom || !currentName) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      name: currentName,
      text,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      replyTo: replyTo || null,
      reactions: {},
    };

    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift();
    room.totalMessages++;

    io.to(currentRoom).emit("message", msg);
    if (cb) cb({ ok: true, id: msg.id });
  });

  socket.on("react", ({ msgId, emoji }) => {
    if (!currentRoom || !currentName) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const msg = room.messages.find(m => m.id === msgId);
    if (!msg) return;

    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(currentName);
    if (idx >= 0) {
      msg.reactions[emoji].splice(idx, 1);
      if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji].push(currentName);
    }
    io.to(currentRoom).emit("reaction_update", { msgId, reactions: msg.reactions });
  });

  socket.on("typing", () => {
    if (!currentRoom || !currentName) return;
    socket.to(currentRoom).emit("typing", currentName);
  });

  socket.on("stop_typing", () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("stop_typing", currentName);
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      room.online.delete(socket.id);
      const memberList = [...room.online.values()].map(u => u.name);
      io.to(currentRoom).emit("member_list", memberList);
      socket.to(currentRoom).emit("user_left", { name: currentName });
      io.emit("rooms_updated");
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✦ Chat rodando em http://localhost:${PORT}`));
