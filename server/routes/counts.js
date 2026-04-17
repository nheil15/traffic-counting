const express = require('express');
const cameraService = require('../services/cameraService');

module.exports = (io) => {
  const router = express.Router();

  // Get counts
  router.get('/', async (req, res) => {
    try {
      const counts = await cameraService.getCounts();
      res.json({
        counts: counts,
        timestamp: new Date().toISOString(),
        is_running: cameraService.isRunning
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reset counts
  router.post('/reset', async (req, res) => {
    try {
      const result = await cameraService.resetCounts();
      io.emit('counts-reset', result);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Set counting line
  router.post('/counting-line', async (req, res) => {
    try {
      const { y } = req.body;
      if (typeof y !== 'number') {
        return res.status(400).json({ error: 'Y coordinate must be a number' });
      }
      const result = await cameraService.setCountingLine(y);
      io.emit('counting-line-set', result);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
