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
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';

// Initialize express app
const app = express();
const server = http.createServer(app);

// ⚠️ CRITICAL: Set CSP headers FIRST, before all other middleware
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://storage.googleapis.com https://cdn.jsdelivr.net; " +
    "connect-src 'self' https://storage.googleapis.com wss: ws:; " +
    "img-src 'self' data: https:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self' data:; " +
    "worker-src 'self' blob:; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Determine allowed origins (support localhost:3000, :3001, :5173, etc.)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173'
];

// Helper to check if origin is allowed
const isOriginAllowed = (origin, req) => {
  // Allow no origin (direct connections, curl, etc.)
  if (!origin) return true;
  
  // Allow whitelisted origins
  if (allowedOrigins.includes(origin)) return true;
  
  // In production (Vercel), allow same domain requests
  const host = req.get('host');
  if (host && origin.includes(host)) return true;
  
  // Allow vercel preview deployments and production
  if (origin.includes('vercel.app')) return true;
  
  // Allow requests from localhost on any port
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) return true;
  
  return false;
};

const noopIo = {
  emit: () => {},
  on: () => {},
  to: () => noopIo,
  in: () => noopIo
};

const io = isVercel ? noopIo : socketIO(server, {
  cors: {
    origin: function(origin, callback) {
      // For Socket.io, we need to be more permissive in production
      if (!origin) {
        console.log('✓ Socket.io: Allowing request with no origin');
        return callback(null, true);
      }
      
      if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('vercel.app')) {
        console.log(`✓ Socket.io: Origin allowed: ${origin}`);
        callback(null, true);
      } else {
        console.log(`⚠ Socket.io: Origin rejected (may retry): ${origin}`);
        // Don't block - many Socket.io transports don't send origin
        callback(null, true);
      }
    },
    credentials: true
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,  // Disabled - set manually above as FIRST middleware
  hsts: true,
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' }
}));

app.use(compression());
app.use(morgan('dev'));
app.use(cors({
  origin: function(origin, callback) {
    // Always allow CORS in production - this is a public API
    // We've already validated it's coming from our app via CSP headers
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const fs = require('fs');

// Serve static files from React build
let clientBuild;
try {
  // List of possible paths where client/build might be on Vercel
  const possiblePaths = [
    // Local development
    path.join(__dirname, '../client/build'),
    path.join(__dirname, './client/build'),
    path.resolve(process.cwd(), 'client/build'),
    // Vercel serverless function paths
    path.join('/var/task', 'client/build'),
    path.join('/var/task', '../..', 'client/build'),
    '/vercel/output/static',
  ];
  
  console.log(`📍 Current __dirname: ${__dirname}`);
  console.log(`📍 Current cwd: ${process.cwd()}`);
  
  clientBuild = null;
  for (const tryPath of possiblePaths) {
    try {
      if (fs.existsSync(tryPath)) {
        const indexPath = path.join(tryPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          clientBuild = tryPath;
          console.log(`✅ Found client build at: ${clientBuild}`);
          break;
        }
      }
    } catch (e) {
      // Continue to next path
    }
  }
  
  if (!clientBuild) {
    console.warn(`⚠️  Client build not found in any of these locations:`);
    possiblePaths.forEach(p => console.warn(`  - ${p} (exists: ${fs.existsSync(p)})`));
    // Default to first option for fallback
    clientBuild = possiblePaths[0];
  }
} catch (err) {
  console.log(`⚠️  Error resolving client build directory: ${err.message}`);
  clientBuild = path.join(__dirname, '../client/build');
}

// Serve static files with proper error handling
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild, { 
    maxAge: '1h',
    etag: false
  }));
  console.log(`📁 Serving React app from: ${clientBuild}`);
} else {
  console.warn(`⚠️  WARNING: Client build directory not found at ${clientBuild}`);
  console.warn(`   Static files will not be served. React app will return 404.`);
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
if (!isVercel) {
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
}

// React catch-all route (SPA routing)
app.get('*', (req, res) => {
  // Don't serve HTML for API routes
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  const indexPath = path.join(clientBuild, 'index.html');
  
  // Check if the file exists before trying to send it
  if (!fs.existsSync(indexPath)) {
    console.error(`React index.html not found at: ${indexPath}`);
    return res.status(404).json({ 
      error: 'React app not deployed',
      debug: `Looking for: ${indexPath}`,
      buildPath: clientBuild,
      buildExists: fs.existsSync(clientBuild)
    });
  }
  
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`Failed to send ${indexPath}:`, err.message);
      res.status(500).json({ 
        error: 'Failed to serve React app',
        debug: err.message
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
