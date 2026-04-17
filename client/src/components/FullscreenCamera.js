import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import useTensorFlowDetection from '../hooks/useTensorFlowDetection';
import './FullscreenCamera.css';

function FullscreenCamera({ isRunning, counts, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('requesting');
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  // Load TensorFlow model
  const { modelLoaded, error: modelError, detectObjects } = useTensorFlowDetection();

  // Request camera permission and access real camera
  useEffect(() => {
    if (!isRunning) return;

    const startCamera = async () => {
      try {
        console.log('Requesting camera permission...');
        
        // Request camera with explicit permission
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'environment'
          },
          audio: false
        });

        console.log('✓ Camera permission granted');
        console.log('✓ Real camera stream started');
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          setPermissionStatus('granted');
        }
        setCameraError(null);
      } catch (err) {
        console.error('✗ Camera permission error:', err);
        
        let errorMsg = '';
        if (err.name === 'NotAllowedError') {
          errorMsg = 'Camera permission denied. Please allow camera access in browser settings.';
        } else if (err.name === 'NotFoundError') {
          errorMsg = 'No camera found. Please connect a camera device.';
        } else if (err.name === 'NotReadableError') {
          errorMsg = 'Camera is in use by another application.';
        } else {
          errorMsg = `Camera error: ${err.message}`;
        }
        
        setCameraError(errorMsg);
        setPermissionStatus('denied');
        console.error(`Camera Error [${err.name}]: ${errorMsg}`);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          console.log('Stopping camera track...');
          track.stop();
        });
      }
    };
  }, [isRunning]);

  // Real-time detection loop using TensorFlow.js
  useEffect(() => {
    if (!isRunning || !modelLoaded || !videoRef.current) return;

    const runDetection = async () => {
      try {
        if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          // Run detection
          const detections = await detectObjects(videoRef.current);

          if (detections.length > 0) {
            // Send detections to backend for tracking and counting
            try {
              const backendUrl = process.env.NODE_ENV === 'production' 
                ? '/api/camera/process-detections'
                : 'http://localhost:5000/api/camera/process-detections';
              
              await axios.post(backendUrl, {
                frameData: null, // Could send base64 if needed
                detections: detections
              });
            } catch (err) {
              console.debug('Detection send error:', err.message);
            }
          }
        }
      } catch (err) {
        console.error('Detection loop error:', err);
      }
    };

    // Run detection every 100ms (10 FPS for processing)
    detectionIntervalRef.current = setInterval(runDetection, 100);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [isRunning, modelLoaded, detectObjects]);

  // Draw video frame to canvas
  useEffect(() => {
    if (!isRunning || !videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    const drawFrame = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(drawFrame);
    };

    video.onloadedmetadata = () => {
      drawFrame();
    };
  }, [isRunning]);

  return (
    <div className="fullscreen-camera">
      {/* Real camera feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="camera-video"
      />

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* REAL Vehicle count overlay - Top Left SMALL (CCTV Style) */}
      <div className="count-overlay">
        <div className="count-display">
          <div className="count-main">
            <div className="count-number">{counts.total}</div>
            <div className="count-label">VEHICLES</div>
          </div>
          <div className="vehicle-breakdown">
            <div className="breakdown-row">
              <span className="type-label">Cars:</span>
              <span className="type-count">{counts.car}</span>
            </div>
            <div className="breakdown-row">
              <span className="type-label">Trucks:</span>
              <span className="type-count">{counts.truck}</span>
            </div>
            <div className="breakdown-row">
              <span className="type-label">Buses:</span>
              <span className="type-count">{counts.bus}</span>
            </div>
            <div className="breakdown-row">
              <span className="type-label">Bikes:</span>
              <span className="type-count">{counts.motorcycle}</span>
            </div>
            <div className="breakdown-row">
              <span className="type-label">Trike:</span>
              <span className="type-count">{counts.tricycle}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status indicator - Bottom Right */}
      <div className="status-indicator">
        <div className={`status-dot ${permissionStatus === 'granted' ? 'running' : 'waiting'}`}></div>
        <span>{permissionStatus === 'granted' ? 'LIVE' : 'REQUESTING'}</span>
      </div>

      {/* Permission message */}
      {permissionStatus === 'requesting' && (
        <div className="permission-message">
          <div className="permission-content">
            <h2>🔐 Camera Permission Required</h2>
            <p>This app needs access to your camera to count vehicles in real-time.</p>
            <p>Please click <strong>"Allow"</strong> when your browser asks for permission.</p>
            <div className="spinner-small"></div>
          </div>
        </div>
      )}

      {/* Model Loading Indicator - Show while model loads (after permission granted) */}
      {permissionStatus === 'granted' && !modelLoaded && (
        <div className="model-loading">
          <div className="model-loading-content">
            <p>Loading AI model...</p>
            <div className="spinner-small"></div>
          </div>
        </div>
      )}

      {/* Error message - Permission Denied */}
      {permissionStatus === 'denied' && (
        <div className="permission-denied">
          <div className="error-content">
            <h2>❌ Camera Access Denied</h2>
            <p>{cameraError}</p>
            <div className="fix-steps">
              <p><strong>To fix this:</strong></p>
              <ol>
                <li>Check your browser's camera permission settings</li>
                <li>Allow camera access for this website</li>
                <li>Refresh the page</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Model loading error */}
      {modelError && (
        <div className="camera-error">
          AI Model Error: {modelError}. Detection will run in fallback mode.
        </div>
      )}

      {/* Error message - Technical Error */}
      {cameraError && permissionStatus !== 'denied' && (
        <div className="camera-error">
          {cameraError}
        </div>
      )}
    </div>
  );
}

export default FullscreenCamera;
