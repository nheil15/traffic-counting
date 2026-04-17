const axios = require('axios');
const { SimpleDetector } = require('../detectionService');

class CameraService {
  constructor() {
    this.pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:5050';
    this.isRunning = false;
    this.currentCounts = {
      total: 0,
      car: 0,
      truck: 0,
      bus: 0,
      motorcycle: 0,
      tricycle: 0
    };
    this.countingLineY = 240;
    this.cameraSource = 0;
    
    // Node.js detection service (no Python required!)
    this.detector = new SimpleDetector();
    this.usePythonBackend = process.env.USE_PYTHON_BACKEND === 'true';
  }

  async start(source = 0) {
    try {
      // Try Python backend first if configured
      if (this.usePythonBackend) {
        try {
          const response = await axios.post(`${this.pythonApiUrl}/camera/start`, {
            source: source
          });
          this.isRunning = true;
          this.cameraSource = source;
          return { ...response.data, backend: 'python' };
        } catch (err) {
          console.log('[!] Python backend unavailable, using Node.js detection');
          this.usePythonBackend = false;
        }
      }
      
      // Use Node.js detection
      this.isRunning = true;
      this.cameraSource = source;
      this.detector.resetCounts();
      
      return {
        message: 'Camera started - Node.js REAL detection active',
        source,
        backend: 'nodejs',
        detectionType: 'REAL - Vehicle Tracking (Hybrid)'
      };
    } catch (error) {
      console.error('Error starting camera:', error.message);
      throw new Error('Failed to start camera: ' + error.message);
    }
  }

  async stop() {
    try {
      if (this.usePythonBackend) {
        try {
          const response = await axios.post(`${this.pythonApiUrl}/camera/stop`);
          this.isRunning = false;
          return { ...response.data, backend: 'python' };
        } catch (err) {
          console.log('[!] Python backend unavailable');
        }
      }
      
      this.isRunning = false;
      return {
        message: 'Camera stopped',
        final_counts: this.detector.getCounts(),
        backend: 'nodejs',
        detection_type: 'REAL - Vehicle detection stopped'
      };
    } catch (error) {
      console.error('Error stopping camera:', error.message);
      throw new Error('Failed to stop camera');
    }
  }

  async getCounts() {
    try {
      if (this.usePythonBackend) {
        try {
          const response = await axios.get(`${this.pythonApiUrl}/api/counts`);
          this.currentCounts = response.data.counts;
          return this.currentCounts;
        } catch (err) {
          // Fall through to Node.js detection
        }
      }
      
      // Use Node.js detector
      this.currentCounts = this.detector.getCounts();
      return this.currentCounts;
    } catch (error) {
      console.error('Error getting counts:', error.message);
      return this.currentCounts;
    }
  }

  async resetCounts() {
    try {
      if (this.usePythonBackend) {
        try {
          await axios.post(`${this.pythonApiUrl}/api/counts/reset`);
        } catch (err) {
          console.log('[!] Python backend unavailable');
        }
      }
      
      this.detector.resetCounts();
      this.currentCounts = this.detector.getCounts();
      return { message: 'Counts reset' };
    } catch (error) {
      console.error('Error resetting counts:', error.message);
      throw new Error('Failed to reset counts');
    }
  }

  async setCountingLine(y) {
    try {
      this.countingLineY = y;
      if (this.usePythonBackend) {
        try {
          await axios.post(`${this.pythonApiUrl}/api/counts/counting-line`, { y });
        } catch (err) {
          console.log('[!] Python backend unavailable');
        }
      }
      
      this.detector.setCountingLine(y);
      return { message: 'Counting line set', y_coordinate: y };
    } catch (error) {
      console.error('Error setting counting line:', error.message);
      throw new Error('Failed to set counting line');
    }
  }

  // NEW: Process frame detections from client (TensorFlow.js)
  processFrameDetections(frameData, detections) {
    /**
     * Called when client (browser) sends frame detections
     * frameData: base64 or buffer (for reference)
     * detections: array of {bbox: [x,y,w,h], class, confidence}
     */
    if (!this.isRunning) return null;

    const result = this.detector.processFrame(frameData, detections);
    this.currentCounts = result.counts;
    return result;
  }

  async getStatus() {
    try {
      if (this.usePythonBackend) {
        try {
          const response = await axios.get(`${this.pythonApiUrl}/api/camera/status`);
          return { ...response.data, backend: 'python' };
        } catch (err) {
          console.log('[!] Python backend unavailable');
        }
      }
      
      return {
        isRunning: this.isRunning,
        detectorInitialized: true,
        cameraSource: this.cameraSource,
        counts: this.detector.getCounts(),
        backend: 'nodejs',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        is_running: this.isRunning,
        detector_initialized: true,
        camera_source: this.cameraSource,
        counts: this.currentCounts,
        timestamp: new Date().toISOString()
      };
    }
  }

  startMockCounting() {
    // DISABLED - Only count real detections from camera
    // Mock data generation removed
  }

  stopMockCounting() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }
}

module.exports = new CameraService();
