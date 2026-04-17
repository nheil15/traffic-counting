import React, { useState } from 'react';
import FullscreenCamera from './components/FullscreenCamera';
import './App.css';

function App() {
  const [isRunning] = useState(true);

  return (
    <div className="app">
      {/* Show camera always - counting happens fully client-side */}
      <FullscreenCamera isRunning={isRunning} onClose={() => {}} />
    </div>
  );
}

export default App;
