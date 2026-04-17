import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import FullscreenCamera from './components/FullscreenCamera';
import './App.css';

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [counts, setCounts] = useState({
    total: 0,
    car: 0,
    truck: 0,
    bus: 0,
    motorcycle: 0,
    tricycle: 0
  });

  // Define API base URL
  const API_BASE = process.env.NODE_ENV === 'production' 
    ? '/api' 
    : 'http://localhost:5000/api';

  // Memoized fetchStatus function
  const fetchStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/camera/status`);
      setIsRunning(response.data.is_running);
      setCounts(response.data.counts);
    } catch (err) {
      console.error('Error fetching status:', err.message);
    }
  }, [API_BASE]);

  // Memoized handleStart function
  const handleStart = useCallback(async () => {
    try {
      await axios.post(`${API_BASE}/camera/start`, {
        source: 0
      });
      setIsRunning(true);
      setCounts({
        total: 0,
        car: 0,
        truck: 0,
        bus: 0,
        motorcycle: 0,
        tricycle: 0
      });
    } catch (err) {
      console.error('Failed to start camera:', err.message);
    }
  }, [API_BASE]);

  // Initialize WebSocket connection
  useEffect(() => {
    // Connect directly to backend, bypassing CRA proxy
    const socketUrl = process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : 'http://localhost:5000';
    
    const newSocket = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    });

    newSocket.on('camera-started', (data) => {
      setIsRunning(true);
    });

    newSocket.on('camera-stopped', (data) => {
      setIsRunning(false);
      if (data.final_counts) {
        setCounts(data.final_counts);
      }
    });

    newSocket.on('counts-updated', (data) => {
      setCounts(data);
    });

    // Handle socket errors silently

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Fetch initial status on load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-start camera on load
  useEffect(() => {
    if (!isRunning) {
      handleStart();
    }
  }, [isRunning, handleStart]);

  return (
    <div className="app">
      {/* Show camera always - loading state handled in FullscreenCamera component */}
      <FullscreenCamera isRunning={isRunning} counts={counts} onClose={() => {}} />
    </div>
  );
}

export default App;
