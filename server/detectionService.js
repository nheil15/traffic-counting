/**
 * Detection Service - Core vehicle detection logic
 * Works with frame data (buffers/images) from client
 * Pure JavaScript - no native OpenCV required
 * Vercel-compatible!
 */

class VehicleTracker {
  constructor(maxDistance = 50, maxFramesMissing = 10) {
    this.vehicles = new Map();
    this.nextId = 1;
    this.maxDistance = maxDistance;
    this.maxFramesMissing = maxFramesMissing;
    this.frameCount = 0;
    this.counts = {
      total: 0,
      car: 0,
      truck: 0,
      bus: 0,
      motorcycle: 0,
      tricycle: 0
    };
    this.countedIds = new Set();
    this.countingLineY = 240;
  }

  getCenter(bbox) {
    const [x, y, w, h] = bbox;
    return { x: x + w / 2, y: y + h / 2 };
  }

  distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  update(detections) {
    this.frameCount += 1;
    const matched = new Set();

    for (const det of detections) {
      const [bbox, className, confidence] = det;
      const detCenter = this.getCenter(bbox);
      let bestMatch = null;
      let bestDistance = this.maxDistance;

      for (const [vehicleId, vehicleInfo] of this.vehicles) {
        if (matched.has(vehicleId)) continue;
        const vehicleCenter = this.getCenter(vehicleInfo.bbox);
        const dist = this.distance(detCenter, vehicleCenter);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestMatch = vehicleId;
        }
      }

      if (bestMatch !== null) {
        this.vehicles.get(bestMatch).bbox = bbox;
        this.vehicles.get(bestMatch).class = className;
        this.vehicles.get(bestMatch).framesMissing = 0;
        matched.add(bestMatch);
        this._checkCountingLine(bestMatch);
      } else {
        const newId = this.nextId++;
        this.vehicles.set(newId, {
          bbox,
          class: className,
          confidence,
          framesMissing: 0,
          firstSeen: this.frameCount
        });
        matched.add(newId);
      }
    }

    for (const [vehicleId, vehicleInfo] of this.vehicles) {
      if (!matched.has(vehicleId)) {
        vehicleInfo.framesMissing += 1;
        if (vehicleInfo.framesMissing > this.maxFramesMissing) {
          this.vehicles.delete(vehicleId);
        }
      }
    }
  }

  _checkCountingLine(vehicleId) {
    if (this.countedIds.has(vehicleId)) return;
    const vehicle = this.vehicles.get(vehicleId);
    const [x, y, w, h] = vehicle.bbox;
    const vehicleBottom = y + h;

    if (vehicleBottom >= this.countingLineY && !this.countedIds.has(vehicleId)) {
      const className = vehicle.class;
      this.counts.total += 1;
      if (className in this.counts) {
        this.counts[className] += 1;
      }
      this.countedIds.add(vehicleId);
    }
  }

  setCountingLine(y) {
    this.countingLineY = y;
  }

  getVehicles() {
    return Object.fromEntries(this.vehicles);
  }

  getCounts() {
    return { ...this.counts };
  }

  resetCounts() {
    this.counts = { total: 0, car: 0, truck: 0, bus: 0, motorcycle: 0, tricycle: 0 };
    this.countedIds = new Set();
    this.vehicles.clear();
    this.nextId = 1;
  }
}

class SimpleDetector {
  /**
   * Simple rule-based detector for demo/fallback
   * In production, use TensorFlow.js on client side
   */
  constructor() {
    this.tracker = new VehicleTracker();
    this.frameCount = 0;
  }

  // Mock detection for demo - returns detected rectangles
  detectObjects(frameData) {
    /**
     * Simple contour/edge detection equivalent
     * In production: client sends TensorFlow.js detections
     */
    this.frameCount += 1;

    // For now, simulate detections
    // In production, client will send real detections from TensorFlow.js/COCO-SSD
    const detections = [];

    // Could add simple heuristics here:
    // - Histogram analysis
    // - Motion detection
    // - etc.

    return detections;
  }

  processFrame(frameData, clientDetections = []) {
    /**
     * Process frame with detections from client
     * frameData: buffer or base64 image
     * clientDetections: array of {bbox: [x,y,w,h], class, confidence}
     */
    
    // Convert client detections to tracker format
    const detections = clientDetections.map(det => [
      det.bbox,
      det.class.toLowerCase(),
      det.confidence || 0.8
    ]);

    // Update tracker
    this.tracker.update(detections);

    return {
      vehicles: this.tracker.getVehicles(),
      counts: this.tracker.getCounts()
    };
  }

  getCounts() {
    return this.tracker.getCounts();
  }

  resetCounts() {
    this.tracker.resetCounts();
  }

  setCountingLine(y) {
    this.tracker.setCountingLine(y);
  }
}

module.exports = { SimpleDetector, VehicleTracker };
