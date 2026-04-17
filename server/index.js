require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

// Import routes
const healthRouter = require('./routes/health');
const cameraRouter = require('./routes/camera');
const countsRouter = require('./routes/counts');
const configRouter = require('./routes/config');

// Initialize express app
const app = express();
const server = http.createServer(app);

// Determine allowed origins (support localhost:3000, :3001, :5173, etc.)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173'
];

const io = socketIO(server, {
  cors: {
    origin: function(origin, callback) {
      // Allow requests with no origin (mobile apps, curl requests, direct connections)
      if (!origin) {
        console.log('✓ Socket.io: Allowing request with no origin');
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        console.log(`✓ Socket.io: Origin allowed: ${origin}`);
        callback(null, true);
      } else {
        console.log(`✗ Socket.io: Origin rejected: ${origin}`);
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://storage.googleapis.com", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://storage.googleapis.com", "wss:", "ws:"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  }
}));
app.use(compression());
app.use(morgan('dev'));
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl requests, direct connections)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`⚠ HTTP CORS: Origin rejected: ${origin}`);
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const fs = require('fs');

// Serve static files from React build
let clientBuild;
try {
  // Try relative path first (local development)
  clientBuild = path.join(__dirname, '../client/build');
  if (!fs.existsSync(clientBuild)) {
    // Fallback for Vercel where build might be in same directory
    clientBuild = path.join(__dirname, './client/build');
  }
  if (!fs.existsSync(clientBuild)) {
    // Last resort - try direct path
    clientBuild = path.resolve(process.cwd(), 'client/build');
  }
  console.log(`✅ Static files directory: ${clientBuild} (exists: ${fs.existsSync(clientBuild)})`);
} catch (err) {
  console.log(`⚠️  Error resolving client build directory: ${err.message}`);
  clientBuild = path.join(__dirname, '../client/build');
}

if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild, { 
    maxAge: '1h',
    etag: false
  }));
  console.log(`📁 Serving React app from: ${clientBuild}`);
} else {
  console.warn(`⚠️  WARNING: Client build directory not found at ${clientBuild}`);
}

// API Routes
app.use('/api/health', healthRouter);
app.use('/api/camera', cameraRouter(io));
app.use('/api/counts', countsRouter(io));
app.use('/api/config', configRouter);

// Video stream endpoint
app.get('/api/video', (req, res) => {
  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  
  // Placeholder - will be replaced with actual video stream
  res.write('--frame\r\nContent-Type: image/jpeg\r\n\r\n');
  res.write(Buffer.from([]));
  res.write('\r\n');
});

// WebSocket events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  socket.on('start-monitoring', (data) => {
    console.log('Start monitoring:', data);
    io.emit('monitoring-started', { timestamp: new Date() });
  });

  socket.on('stop-monitoring', () => {
    console.log('Stop monitoring');
    io.emit('monitoring-stopped', { timestamp: new Date() });
  });
});

// React catch-all route (SPA routing)
app.get('*', (req, res) => {
  // Don't serve HTML for API routes
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  const indexPath = path.join(clientBuild, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`Failed to send ${indexPath}:`, err.message);
      res.status(404).json({ 
        error: 'Not found',
        debug: `Looking for: ${indexPath}`
      });
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// Start server only in non-serverless environments
if (process.env.VERCEL === undefined) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📺 Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Export for both serverless (default export) and local (named exports)
module.exports = app;
module.exports.default = app;
module.exports.io = io;
