/**
 * Vehicle Tracking Hook - Client-side only
 * Runs entirely in the browser, no server dependency
 */

import { useRef, useCallback, useState } from 'react';

class VehicleTracker {
  constructor(maxDistance = 50, maxFramesMissing = 3) {
    this.vehicles = new Map();
    this.nextId = 1;
    this.maxDistance = maxDistance;
    this.maxFramesMissing = maxFramesMissing; // Reduced from 10 to 3 for quick removal
    this.frameCount = 0;
    this.counts = {
      total: 0,
      car: 0,
      truck: 0,
      bus: 0,
      motorcycle: 0,
      bicycle: 0,
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

    // Deduplicate overlapping detections in the same frame
    const deduplicatedDetections = this._deduplicateDetections(detections);

    for (const det of deduplicatedDetections) {
      const [bbox, className, confidence] = det;
      const detCenter = this.getCenter(bbox);
      let bestMatch = null;
      let bestDistance = this.maxDistance;
      let bestMatchClass = null;

      for (const [vehicleId, vehicleInfo] of this.vehicles) {
        if (matched.has(vehicleId)) continue;
        
        const vehicleCenter = this.getCenter(vehicleInfo.bbox);
        const dist = this.distance(detCenter, vehicleCenter);
        
        // Prefer matching same class objects at closer distance
        // Allow slightly larger distance for same class
        const classMatchBonus = vehicleInfo.class === className ? 15 : 0;
        const effectiveDistance = dist - classMatchBonus;
        
        if (effectiveDistance < bestDistance) {
          bestDistance = effectiveDistance;
          bestMatch = vehicleId;
          bestMatchClass = vehicleInfo.class;
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

  _deduplicateDetections(detections) {
    // Remove overlapping detections of the same class
    const filtered = [];
    const used = new Set();

    for (let i = 0; i < detections.length; i++) {
      if (used.has(i)) continue;

      const [bbox1, class1] = detections[i];
      filtered.push(detections[i]);
      used.add(i);

      // Check for overlaps with remaining detections
      for (let j = i + 1; j < detections.length; j++) {
        if (used.has(j)) continue;

        const [bbox2, class2] = detections[j];

        // Only merge same class detections
        if (class1 === class2) {
          const iou = this._calculateIoU(bbox1, bbox2);
          // If boxes overlap more than 30%, keep the one with larger area
          if (iou > 0.3) {
            const area1 = bbox1[2] * bbox1[3];
            const area2 = bbox2[2] * bbox2[3];
            if (area2 > area1) {
              // Replace with larger box
              filtered[filtered.length - 1] = detections[j];
            }
            used.add(j);
          }
        }
      }
    }

    return filtered;
  }

  _calculateIoU(bbox1, bbox2) {
    const [x1, y1, w1, h1] = bbox1;
    const [x2, y2, w2, h2] = bbox2;

    // Calculate intersection
    const xLeft = Math.max(x1, x2);
    const yTop = Math.max(y1, y2);
    const xRight = Math.min(x1 + w1, x2 + w2);
    const yBottom = Math.min(y1 + h1, y2 + h2);

    if (xRight < xLeft || yBottom < yTop) return 0; // No intersection

    const intersection = (xRight - xLeft) * (yBottom - yTop);
    const area1 = w1 * h1;
    const area2 = w2 * h2;
    const union = area1 + area2 - intersection;

    return union > 0 ? intersection / union : 0;
  }

  _checkCountingLine(vehicleId) {
    if (this.countedIds.has(vehicleId)) return;
    const vehicle = this.vehicles.get(vehicleId);
    const [, , , h] = vehicle.bbox;
    const y = vehicle.bbox[1];
    const vehicleBottom = y + h;

    // Only count if it's a vehicle and crosses the counting line
    if (vehicleBottom >= this.countingLineY && !this.countedIds.has(vehicleId)) {
      const className = vehicle.class;
      // Only increment count if it's a tracked vehicle type (not people, animals, etc)
      if (className in this.counts) {
        this.counts[className] += 1;
        this._updateTotal();
      }
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
  // Optimized tracking parameters:
  // maxDistance=55: Allows matching even if object moves slightly between frames
  // maxFramesMissing=2: Very fast removal when object leaves view
  const trackerRef = useRef(new VehicleTracker(55, 2));
  const [counts, setCounts] = useState({
    total: 0,
    car: 0,
    truck: 0,
    bus: 0,
    motorcycle: 0,
    tricycle: 0
  });
  const [trackedVehicles, setTrackedVehicles] = useState({});

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

    // Update tracked vehicles for drawing bounding boxes
    const vehicles = trackerRef.current.getVehicles();
    setTrackedVehicles(vehicles);

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
    counts,
    trackedVehicles
  };
};

export default useVehicleTracking;
