const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Primary Contact for Updates
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'thepyraxis@gmail.com';

// Security Middleware
app.use(helmet()); // Sets various security HTTP headers

// CORS Configuration defined as a variable to be reused by Socket.io
const corsOptions = {
    origin: [
        "https://eateria-ui.netlify.app",    // Your Production Netlify URL
        "http://localhost:5500",              // VS Code Live Server
        "http://127.0.0.1:5500",
        "http://localhost:3000",              // React/Vue default
        "http://127.0.0.1:3000",
        "http://localhost:5000"               // Backend local
    ]
};
app.use(cors(corsOptions));

// Socket.io Initialization
const io = new Server(server, {
    cors: corsOptions
});

// MongoDB Connection (Phase 3)
const connectDB = async () => {
    if (process.env.MONGODB_URI) {
        try {
            const conn = await mongoose.connect(process.env.MONGODB_URI);
            console.log(`MongoDB Connected: ${conn.connection.host}`);
        } catch (err) {
            console.error(`Error: ${err.message}`);
            // Exit process with failure if DB is required for production
            if (process.env.NODE_ENV === 'production') process.exit(1);
        }
    }
};
connectDB();

// Mongoose Schema for Orders (Moved from in-memory to Database for production)
const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    items: Array,
    total: Number,
    status: { type: String, default: 'Preparing' },
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// Mongoose Schema for Reservations
const reservationSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    date: String,
    guests: String,
    time: String,
    occasion: String,
    requests: String,
    status: { type: String, default: 'confirmed' },
    createdAt: { type: Date, default: Date.now }
});
const Reservation = mongoose.model('Reservation', reservationSchema);

// Rate Limiting: Prevent Brute Force
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // Limit each IP to 100 requests per window
});
app.use('/api/', limiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// requested HOME ROUTE
// ==========================================
app.get('/', (req, res) => {
    res.send('Eateria API v1.1 — Connected');
});

// ==========================================
// requested ORDER TRACKING ROUTE
// ==========================================
app.get('/api/order', (req, res) => {
    res.json({
        orderId: "#98421",
        status: "Out for Delivery",
        eta: "Arriving in 12 mins",
        rider: "Rahul Sharma"
    });
});

// ==========================================
// 1. Menu API
// ==========================================
app.get('/api/menu', (req, res) => {
    // This allows you to update prices in one place
    const menu = [
        { id: 'spicy-tuna', name: 'Spicy Tuna Roll', price: 499, category: 'sushi' },
        { id: 'dan-dan', name: 'Spicy Dan Dan Noodles', price: 549, category: 'noodles' },
        { id: 'yakitori', name: 'Grilled Robata Skewers', price: 599, category: 'robata' },
        { id: 'ramen', name: 'Szechuan Beef Ramen', price: 649, category: 'noodles' },
        { id: 'salmon', name: 'Pan-Asian Grilled Salmon', price: 749, category: 'poke' }
    ];
    res.json(menu);
});

// ==========================================
// 2. Reservations API
// ==========================================
app.post('/api/reservations', [
    // Sanitize and Validate Input
    body('name').trim().isLength({ min: 2 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('date').isISO8601(),
    body('guests').isInt({ min: 1, max: 20 })
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const newReservation = new Reservation(req.body);

    newReservation.save()
        .then(savedDoc => {
            res.status(201).json({ message: 'Reservation successful', data: savedDoc });
        })
        .catch(err => {
            console.error('Reservation Error:', err);
            res.status(500).json({ message: 'Database Error', error: err });
        });
});

// ==========================================
// 3. Orders & Tracking API
// ==========================================
app.post('/api/orders', [
    body('cart').isArray({ min: 1 }).withMessage('Cart must contain items'),
    body('total').isNumeric().withMessage('Total must be a number'),
    body('paymentMethod').notEmpty().escape()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { cart, paymentMethod, total } = req.body;

    const orderData = {
        orderId: `ORD-${Math.floor(10000 + Math.random() * 90000)}`,
        items: cart,
        total,
        status: 'Preparing'
    };

    try {
        const newOrder = new Order(orderData);
        await newOrder.save();
        
        // Trigger real-time tracking update via Socket.io
        io.emit('orderUpdate', { 
            status: 'Preparing', 
            orderId: newOrder.orderId 
        });

        // Simulate external services (SMS, Kitchen notification)
        res.status(201).json({ 
            message: 'Order placed successfully', 
            orderId: newOrder.orderId 
        });
    } catch (err) {
        console.error('Order Error:', err);
        res.status(500).json({ message: 'Failed to place order' });
    }
});

// Real-time Tracking (Phase 4)
io.on('connection', (socket) => {
    socket.on('disconnect', () => {
        // Handle disconnect logic
    });
});
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
});

server.listen(PORT, () => {
    console.log(`Eateria Server running on http://localhost:${PORT}`);
});