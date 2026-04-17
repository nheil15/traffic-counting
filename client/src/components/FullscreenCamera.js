import React, { useEffect, useRef, useState } from 'react';
import useTensorFlowDetection from '../hooks/useTensorFlowDetection';
import useVehicleTracking from '../hooks/useVehicleTracking';
import './FullscreenCamera.css';

function FullscreenCamera({ isRunning, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('requesting');
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  // Load TensorFlow model
  const { modelLoaded, error: modelError, detectObjects } = useTensorFlowDetection();
  
  // Client-side vehicle tracking
  const { processDetections, counts, trackedVehicles } = useVehicleTracking();

  // Canvas overlay for drawing bounding boxes
  const overlayCanvasRef = useRef(null);

  // Request camera permission and access real camera
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          const msg = 'Camera API not supported in this browser';
          throw new Error(msg);
        }

        const constraints = {
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'environment'
          },
          audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          videoRef.current.play().catch(() => {});
          setPermissionStatus('granted');
        }
        setCameraError(null);
      } catch (err) {
        let errorMsg = '';
        if (err.name === 'NotAllowedError') {
          errorMsg = 'Camera permission denied. Please allow camera access in browser settings.';
        } else if (err.name === 'NotFoundError') {
          errorMsg = 'No camera found. Please connect a camera device.';
        } else if (err.name === 'NotReadableError') {
          errorMsg = 'Camera is in use by another application.';
        } else if (err.name === 'SecurityError') {
          errorMsg = 'Camera access blocked for security reasons. This usually requires HTTPS.';
        } else if (err.name === 'TypeError') {
          errorMsg = 'Camera permission request failed. Try refreshing the page.';
        } else {
          errorMsg = `Camera error [${err.name}]: ${err.message}`;
        }
        
        setCameraError(errorMsg);
        setPermissionStatus('denied');
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  // Real-time detection loop using TensorFlow.js
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isRunning || !modelLoaded || !videoRef.current) return;

    const runDetection = async () => {
      try {
        if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          // Run detection
          const detections = await detectObjects(videoRef.current);

          // Process detections locally in browser
          if (detections.length > 0) {
            processDetections(detections);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Draw bounding boxes overlay
  useEffect(() => {
    if (!isRunning || !videoRef.current || !overlayCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');

    const drawBoxes = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Clear canvas - fresh draw every frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Color palette for different object types
        const colors = {
          car: '#00FF00',
          truck: '#FF6600',
          bus: '#FF00FF',
          motorcycle: '#00FFFF',
          bicycle: '#FFAA00',
          tricycle: '#FFFF00',
          person: '#FF0099',
          dog: '#00FFAA',
          cat: '#AA00FF'
        };

        // Draw one box per tracked object (follows the object)
        Object.entries(trackedVehicles).forEach(([vehicleId, vehicle]) => {
          if (!vehicle || !vehicle.bbox) return; // Skip if no bbox
          
          const [x, y, w, h] = vehicle.bbox;
          
          // Validate coordinates
          if (x < 0 || y < 0 || w <= 0 || h <= 0) return;
          
          const boxColor = colors[vehicle.class] || '#888888';
          const lineWidth = 3;

          // Draw bounding box
          ctx.strokeStyle = boxColor;
          ctx.lineWidth = lineWidth;
          ctx.strokeRect(x, y, w, h);

          // Draw class label
          const label = vehicle.class.toUpperCase();
          const fontSize = 14;
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.fillStyle = boxColor;
          
          const labelWidth = ctx.measureText(label).width;
          ctx.fillRect(x, y - fontSize - 8, labelWidth + 10, fontSize + 8);
          
          ctx.fillStyle = '#000000';
          ctx.fillText(label, x + 5, y - 5);
        });
      }
      requestAnimationFrame(drawBoxes);
    };

    video.onloadedmetadata = () => {
      drawBoxes();
    };

    // Start drawing if video is already loaded
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      drawBoxes();
    }
  }, [isRunning, trackedVehicles]);

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

      {/* Bounding box overlay canvas */}
      <canvas 
        ref={overlayCanvasRef} 
        className="bounding-box-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
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
              <span className="type-label">Motor:</span>
              <span className="type-count">{counts.motorcycle}</span>
            </div>
            <div className="breakdown-row">
              <span className="type-label">Bicycle:</span>
              <span className="type-count">{counts.bicycle}</span>
            </div>
            <div className="breakdown-row">
              <span className="type-label">Tricycle:</span>
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
