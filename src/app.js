const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

// Allow requests from the frontend and enable credentials
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Parse cookies
app.use(cookieParser());

// Read JSON request bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Simple test route
app.get('/api/health', (req, res) => {
  res.json({ message: 'PASC Backend is running!' });
});

// Auth routes
app.use('/api/auth', authRoutes);

// AI routes (study/quiz/ask/plan)
app.use('/api/ai', aiRoutes);

// Chat route for PASC conversational feature
app.use('/api/chat', chatRoutes);

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = app;
