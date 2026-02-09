const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const routes = require('./routes');
const transporter = require('./mailer');

const app = express();

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for static serving simplicity during dev
}));
app.use(cors({
    origin: config.corsOrigin
}));
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // increased limit for static resources
});
app.use('/api', limiter);

// Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, '../../')));

// API Routes
app.use('/api', routes);

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'active', subsystem: 'communication_uplink' });
});

// Fallback for SPA or just root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../index.html'));
});

// Start Server
app.listen(config.port, () => {
    console.log(`TotyLabs Communication Uplink active on port ${config.port}`);
    console.log(`Serving static files from: ${path.join(__dirname, '../../')}`);

    // Verify Email Connection
    transporter.verify((error, success) => {
        if (error) {
            console.warn('\n[WARNING] Email Uplink Failed:');
            console.warn('Check assets/backend/.env credentials.');
            console.warn(`Error: ${error.message}\n`);
        } else {
            console.log('\n[SUCCESS] Email Uplink Established.');
            console.log('Ready to transmit messages.\n');
        }
    });
});
