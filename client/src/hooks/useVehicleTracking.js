/**
 * Vehicle Tracking Hook - Client-side only
 * Runs entirely in the browser, no server dependency
 */

import { useRef, useCallback, useState } from 'react';

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
      if (className in this.counts) {
        this.counts[className] += 1;
      }
      this._updateTotal();
      this.countedIds.add(vehicleId);
    }
  }

  _updateTotal() {
    this.counts.total =
      this.counts.car +
      this.counts.truck +
      this.counts.bus +
      this.counts.motorcycle +
      this.counts.tricycle;
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

export const useVehicleTracking = () => {
  const trackerRef = useRef(new VehicleTracker());
  const [counts, setCounts] = useState({
    total: 0,
    car: 0,
    truck: 0,
    bus: 0,
    motorcycle: 0,
    tricycle: 0
  });

  const processDetections = useCallback((detections) => {
    // Convert detections to tracker format
    const formattedDetections = detections.map(det => [
      det.bbox,
      det.class.toLowerCase(),
      det.confidence || 0.8
    ]);

    // Update tracker
    trackerRef.current.update(formattedDetections);

    // Update state with new counts
    const newCounts = trackerRef.current.getCounts();
    setCounts(newCounts);

    return newCounts;
  }, []);

  const resetCounts = useCallback(() => {
    trackerRef.current.resetCounts();
    setCounts(trackerRef.current.getCounts());
  }, []);

  const setCountingLine = useCallback((y) => {
    trackerRef.current.setCountingLine(y);
  }, []);

  return {
    processDetections,
    resetCounts,
    setCountingLine,
    counts
  };
};

export default useVehicleTracking;
