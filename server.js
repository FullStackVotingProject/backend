const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');
const http = require('http');
const socketIo = require('socket.io');
const PollSessionService = require('./services/pollSessionService');

// Import routes
const authRoutes = require('./routes/auth');
const pollsRoutes = require('./routes/polls');
const votesRoutes = require('./routes/votes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Initialize poll session service
const pollSessionService = new PollSessionService(io);

// Middleware
app.use(cors());
app.use(express.json());

// Make pollSessionService available to routes
app.use((req, res, next) => {
  req.pollSessionService = pollSessionService;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/polls', pollsRoutes);
app.use('/api/votes', votesRoutes);
app.use('/api/users', userRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Test database route
app.get('/api/test', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 as test');
    res.json({ message: 'Backend is working!', dbTest: rows[0] });
  } catch (error) {
    res.status(500).json({ message: 'Database error', error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
