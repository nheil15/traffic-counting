/**
 * TensorFlow.js Vehicle Detection Hook
 * Uses COCO-SSD for real-time object detection
 */

import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { useEffect, useRef, useState, useCallback } from 'react';

// Ensure TensorFlow backend is initialized
const initTensorFlow = async () => {
  try {
    const tf = await import('@tensorflow/tfjs');
    
    // Try WebGL backend first (GPU)
    try {
      await tf.setBackend('webgl');
      console.log('[+] TensorFlow using WebGL backend');
    } catch (err) {
      // Fall back to CPU if WebGL unavailable
      console.log('[!] WebGL unavailable, using CPU backend');
      await tf.setBackend('cpu');
    }
    
    // Ready TensorFlow
    await tf.ready();
    return true;
  } catch (err) {
    console.error('[!] TensorFlow initialization error:', err);
    return false;
  }
};

export const useTensorFlowDetection = () => {
  const modelRef = useRef(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadModel = async () => {
      try {
        // Initialize TensorFlow backend first
        console.log('[+] Initializing TensorFlow...');
        const tfReady = await initTensorFlow();
        
        if (!tfReady) {
          throw new Error('TensorFlow initialization failed');
        }

        console.log('[+] Loading COCO-SSD model...');
        const model = await cocoSsd.load();
        if (mounted) {
          modelRef.current = model;
          setModelLoaded(true);
          console.log('[+] COCO-SSD model loaded successfully');
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
          console.error('[!] Failed to load model:', err);
        }
      }
    };

    loadModel();

    return () => {
      mounted = false;
    };
  }, []);

  const detectObjects = useCallback(async (videoElement) => {
    if (!modelRef.current) return [];

    try {
      const predictions = await modelRef.current.detect(videoElement);

      // Define vehicle classes for counting
      const vehicleClasses = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'];
      
      // Convert ALL detections to standard format (not just vehicles)
      const detections = predictions
        .filter(pred => pred.score > 0.4) // Keep confidence threshold
        .map(pred => ({
          bbox: pred.bbox, // [x, y, width, height]
          class: pred.class === 'bicycle' ? 'tricycle' : pred.class,
          confidence: pred.score,
          isVehicle: vehicleClasses.includes(pred.class) // Mark if it's a vehicle for counting
        }));

      return detections;
    } catch (err) {
      console.error('[!] Detection error:', err);
      return [];
    }
  }, []);

  return {
    modelLoaded,
    error,
    detectObjects
  };
};

export default useTensorFlowDetection;
