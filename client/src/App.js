import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
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
  const isProduction = process.env.NODE_ENV === 'production';
  const initialCounts = {
    total: 0,
    car: 0,
    truck: 0,
    bus: 0,
    motorcycle: 0,
    tricycle: 0
  };

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
    setIsRunning(true);
    setCounts(initialCounts);

    try {
      console.log('🚀 [handleStart] Starting camera with API call:', `${API_BASE}/camera/start`);
      const response = await axios.post(`${API_BASE}/camera/start`, {
        source: 0
      });
      console.log('✅ [handleStart] Camera start response:', response.data);
      if (response.data?.counts) {
        setCounts(response.data.counts);
      }
    } catch (err) {
      console.error('❌ [handleStart] Failed to start camera via API:', err.message);
      if (err.response) {
        console.error('❌ [handleStart] Response data:', err.response.data);
        console.error('❌ [handleStart] Response status:', err.response.status);
      }
      console.log('⚠️ [handleStart] Backend unavailable, keeping the browser camera active locally.');
    }
  }, [API_BASE]);

  useEffect(() => {
    if (!isProduction) return undefined;

    const intervalId = setInterval(fetchStatus, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchStatus, isProduction]);

  // Fetch initial status on load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-start camera on load (one time only)
  useEffect(() => {
    console.log('🔄 [App] Auto-start effect triggered, calling handleStart()...');
    console.log('🔄 [App] Current isRunning before handleStart():', isRunning);
    handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleStart]);

  return (
    <div className="app">
      {/* Show camera always - loading state handled in FullscreenCamera component */}
      <FullscreenCamera isRunning={isRunning} counts={counts} onClose={() => {}} />
    </div>
  );
}

export default App;
