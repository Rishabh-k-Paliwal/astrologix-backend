const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const appointmentRoutes = require('./routes/appointments');
const paymentRoutes = require('./routes/payments');
const videoCallRoutes = require('./routes/videoCall');
const adminRoutes = require('./routes/admin');

// Import middleware
const { auth } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for development
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Request logging for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/astrology-consultancy', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  console.log(`📊 Database: ${mongoose.connection.name}`);
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Make io available to routes
app.set('io', io);

// Test endpoint (should be early in middleware stack)
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Backend server is working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 5000
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const healthStatus = {
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memory: process.memoryUsage()
  };
  
  res.json(healthStatus);
});

// API Routes - CORRECTED ORDER AND STRUCTURE
app.use('/api/auth', authRoutes);
app.use('/api/user', auth, userRoutes); // Auth applied to all user routes
app.use('/api/appointments', appointmentRoutes); // Auth handled within route file
app.use('/api/payments', auth, paymentRoutes);
app.use('/api/video-call', auth, videoCallRoutes);
app.use('/api/admin', auth, adminRoutes);

// Catch-all 404 handler for API routes
app.use('/api/*', (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `API route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /api/health',
      'GET /api/test',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/me',
      'GET /api/user/dashboard',
      'GET /api/user/appointments',
      'POST /api/appointments',
      'GET /api/appointments/available-slots/:date'
    ]
  });
});
app.use('/api/admin', auth, adminRoutes);

// Error handling middleware (MUST be after all routes)
app.use(errorHandler);

// Global error handler with 4 parameters
app.use((err, req, res, next) => {
  console.error('🚨 Global Error Handler:', err.stack);
  
  // Don't send error details in production
  const errorResponse = {
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  };
  
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }
  
  res.status(err.status || err.statusCode || 500).json(errorResponse);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);
  
  // Join user to their personal room
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });

  // Handle video call events
  socket.on('call-user', (data) => {
    console.log('📞 Call initiated:', data);
    socket.to(data.to).emit('incoming-call', {
      from: data.from,
      roomId: data.roomId,
      appointmentId: data.appointmentId
    });
  });
  
  socket.on('accept-call', (data) => {
    console.log('✅ Call accepted:', data);
    socket.to(data.to).emit('call-accepted', data);
  });
  
  socket.on('reject-call', (data) => {
    console.log('❌ Call rejected:', data);
    socket.to(data.to).emit('call-rejected', data);
  });
  
  socket.on('disconnect', () => {
    console.log('👤 User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log('🚀 Server started successfully!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🏠 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`📡 Socket.io server ready`);
  console.log('═'.repeat(50));
  console.log('Available endpoints:');
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log(`  GET  http://localhost:${PORT}/api/test`);
  console.log(`  POST http://localhost:${PORT}/api/auth/register`);
  console.log(`  POST http://localhost:${PORT}/api/auth/login`);
  console.log('═'.repeat(50));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('🚨 Unhandled Promise Rejection:', err.message);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

module.exports = app;
