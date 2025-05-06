const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

require('dotenv').config();

// Handle unhandled promise rejections to prevent server crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
    origin: 'http://127.0.0.1:8080',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'hikari',
    database: process.env.DB_NAME || 'watering_system'
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Handle database connection errors
db.on('error', (err) => {
    console.error('MySQL connection error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('Attempting to reconnect to MySQL...');
        db.connect();
    } else {
        throw err;
    }
});

app.get('/plants', (req, res) => {
    const query = 'SELECT * FROM plant';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching plants:', err);
            res.status(500).json({ error: 'Error fetching plants' });
            return;
        }
        res.json(results);
    });
});

app.post('/plants', (req, res) => {
    const { Name, info, lowerThreshold, upperThreshold } = req.body;

    if (!Name || lowerThreshold === undefined || upperThreshold === undefined || !info) {
        res.status(400).json({ error: 'Name, lowerThreshold, upperThreshold, and info are required' });
        return;
    }

    if (lowerThreshold < 0 || lowerThreshold > 100 || upperThreshold < 0 || upperThreshold > 100) {
        res.status(400).json({ error: 'Lower and Upper Thresholds must be between 0 and 100' });
        return;
    }

    if (lowerThreshold >= upperThreshold) {
        res.status(400).json({ error: 'Lower Threshold must be less than Upper Threshold' });
        return;
    }

    const query = 'INSERT INTO plant (Name, info, lowerThreshold, upperThreshold) VALUES (?, ?, ?, ?)';
    db.query(query, [Name, info, lowerThreshold, upperThreshold], (err, result) => {
        if (err) {
            console.error('Error adding plant:', err);
            res.status(500).json({ error: 'Error adding plant' });
            return;
        }
        res.status(201).json({ message: 'Plant added successfully', plantID: result.insertId });
    });
});

app.get('/history/latest', (req, res) => {
    const query = 'SELECT * FROM history ORDER BY recorded DESC';
    db.query(query, (err, results) => {
        if(err){
            console.error('Error fetching history:', err);
            res.status(500).json({ error: 'Error fetching history' });
            return;
        }
        res.json(results);
    });
});

app.post('/history', (req, res) => {
    const { plantID, soilMoisture, temperature, airMoisture, date, time } = req.body;

    if (!plantID || soilMoisture === undefined || temperature === undefined || airMoisture === undefined || !date || !time) {
        res.status(400).json({ error: 'plantID, soilMoisture, temperature, airMoisture date, and time are required' });
        return;
    }
    const recorded = `${date} ${time}`;

    const query = 'INSERT INTO history (plantID, soilMoisture, temperature, airMoisture, recorded) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [plantID, soilMoisture, temperature, airMoisture, recorded], (err, result) => {
        if (err) {
            console.error('Error adding history entry:', err);
            res.status(500).json({ error: 'Error adding history entry' });
            return;
        }
        res.status(201).json({ message: 'History entry added successfully', timeID: result.insertId });
    });
});

app.post('/control-pump', async (req, res) => {
    const { pumpState } = req.body;

    if (!pumpState || !['on', 'off'].includes(pumpState)) {
        res.status(400).json({ error: 'pumpState must be "on" or "off"' });
        return;
    }

    console.log('Received /control-pump request:', { pumpState });

    try {
        // Create URL-encoded form payload
        const params = new URLSearchParams();
        params.append('body', JSON.stringify({ pumpState }));

        console.log('Sending request to ESP32:', { url: 'http://192.168.1.220/pump', body: params.toString() });

        // Add timeout to fetch
        const timeoutPromise = new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('Request to ESP32 timed out')), 5000); // 5-second timeout
        });

        const fetchPromise = fetch('http://192.168.1.220/pump', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        }).catch(err => {
            throw new Error(`Fetch error: ${err.message}`);
        });

        const esp32Response = await Promise.race([fetchPromise, timeoutPromise]);

        console.log('ESP32 response status:', esp32Response.status);

        if (!esp32Response.ok) {
            const errorText = await esp32Response.text();
            throw new Error(`Failed to control pump: ${esp32Response.status} ${errorText}`);
        }

        console.log(`Pump command sent to ESP32: ${pumpState}`);
        res.status(200).json({ message: `Pump turned ${pumpState} successfully` });
    } catch (error) {
        console.error(`Error sending pump command to ESP32: ${error.message}`);
        res.status(500).json({ error: `Error controlling pump: ${error.message}` });
    }
});

app.post('/send-to-esp32', async (req, res) => {
    const { plantID, lowerThreshold, upperThreshold } = req.body;

    if (!plantID || lowerThreshold === undefined || upperThreshold === undefined) {
        res.status(400).json({ error: 'plantID, lowerThreshold, and upperThreshold are required' });
        return;
    }

    console.log('Received /send-to-esp32 request:', { plantID, lowerThreshold, upperThreshold });

    try {
        // Create URL-encoded form payload
        const params = new URLSearchParams();
        params.append('body', JSON.stringify({ plantID, lowerThreshold, upperThreshold }));

        console.log('Sending request to ESP32:', { url: 'http://192.168.1.220/control', body: params.toString() });

        // Add timeout to fetch
        const timeoutPromise = new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('Request to ESP32 timed out')), 5000); // 5-second timeout
        });

        const fetchPromise = fetch('http://192.168.1.220/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        }).catch(err => {
            throw new Error(`Fetch error: ${err.message}`);
        });

        const esp32Response = await Promise.race([fetchPromise, timeoutPromise]);

        console.log('ESP32 response status:', esp32Response.status);

        if (!esp32Response.ok) {
            const errorText = await esp32Response.text();
            throw new Error(`Failed to send data to ESP32: ${esp32Response.status} ${errorText}`);
        }

        console.log('Data sent to ESP32:', { plantID, lowerThreshold, upperThreshold });
        res.status(200).json({ message: 'Data sent to ESP32 successfully' });
    } catch (error) {
        console.error('Error sending data to ESP32:', error.message);
        res.status(500).json({ error: `Error sending data to ESP32: ${error.message}` });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});