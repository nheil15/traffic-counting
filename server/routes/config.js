const express = require('express');
const router = express.Router();

// Get configuration
router.get('/', (req, res) => {
  res.json({
    flask_backend_url: process.env.PYTHON_API_URL || 'http://localhost:5050',
    use_python_backend: process.env.USE_PYTHON_BACKEND === 'true',
    node_port: process.env.PORT || 5000,
    client_url: process.env.CLIENT_URL || 'http://localhost:3000',
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;
