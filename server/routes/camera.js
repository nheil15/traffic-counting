const express = require('express');
const cameraService = require('../services/cameraService');

module.exports = (io) => {
  const router = express.Router();
  let countPollingInterval = null;
  let lastEmittedCounts = {};

  // Helper function to start real-time count polling
  function startCountPolling() {
    if (countPollingInterval) return;
    
    console.log('📊 Starting real-time count polling from Python backend...');
    
    countPollingInterval = setInterval(async () => {
      try {
        const currentCounts = await cameraService.getCounts();
        
        // Only emit if counts changed (reduce network traffic)
        if (JSON.stringify(currentCounts) !== JSON.stringify(lastEmittedCounts)) {
          io.emit('counts-updated', currentCounts);
          lastEmittedCounts = { ...currentCounts };
        }
      } catch (error) {
        // Silently handle polling errors
      }
    }, 500); // Poll every 500ms for real-time updates
  }

  // Helper function to stop real-time count polling
  function stopCountPolling() {
    if (countPollingInterval) {
      clearInterval(countPollingInterval);
      countPollingInterval = null;
      console.log('Stopped real-time count polling');
    }
  }

  // Start camera - enables REAL detection and polling
  router.post('/start', async (req, res) => {
    try {
      const source = req.body.source || 0;
      const result = await cameraService.start(source);
      
      // Start real-time polling from Python backend
      startCountPolling();
      
      io.emit('camera-started', result);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Stop camera - disables detection and polling
  router.post('/stop', async (req, res) => {
    try {
      const result = await cameraService.stop();
      
      // Stop real-time polling
      stopCountPolling();
      
      io.emit('camera-stopped', result);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get status
  router.get('/status', async (req, res) => {
    try {
      const status = await cameraService.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // NEW: Process frame detections from client (browser-side TensorFlow.js)
  router.post('/process-detections', async (req, res) => {
    try {
      const { frameData, detections } = req.body;
      
      // Auto-start camera if not already running
      if (!cameraService.isRunning) {
        console.log('📹 Auto-starting camera on first detection request...');
        await cameraService.start(0);
        startCountPolling();
      }
      
      // Process detections and update vehicle tracking
      const result = cameraService.processFrameDetections(frameData, detections);
      
      if (!result) {
        return res.status(400).json({ error: 'Failed to process detections' });
      }

      // Broadcast updated counts to all connected clients
      io.emit('counts-updated', result.counts);
      
      res.json({
        success: true,
        counts: result.counts,
        vehicles: result.vehicles
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
