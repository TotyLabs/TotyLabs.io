const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const routes = require('./routes');

const app = express();

// Security Middleware
app.use(helmet());
app.use(cors({
    origin: config.corsOrigin
}));
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10 // limit each IP to 10 requests per windowMs
});
app.use('/api', limiter);

// Routes
app.use('/api', routes);

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'active', subsystem: 'communication_uplink' });
});

// Start Server
app.listen(config.port, () => {
    console.log(`TotyLabs Communication Uplink active on port ${config.port}`);
});
