// Global IST timezone enforcement and master/worker cluster setup
process.env.TZ = 'Asia/Kolkata';

// Override Date prototypes on the backend to enforce IST globally
const originalToLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (locales, options) {
  const opts = { ...options, timeZone: 'Asia/Kolkata' };
  return originalToLocaleDateString.call(this, locales || 'en-IN', opts);
};

const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
Date.prototype.toLocaleTimeString = function (locales, options) {
  const opts = { ...options, timeZone: 'Asia/Kolkata' };
  return originalToLocaleTimeString.call(this, locales || 'en-IN', opts);
};

const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function (locales, options) {
  if (this instanceof Date) {
    const opts = { ...options, timeZone: 'Asia/Kolkata' };
    return originalToLocaleString.call(this, locales || 'en-IN', opts);
  }
  return originalToLocaleString.call(this, locales, options);
};

Date.prototype.toISOString = function () {
  const offsetMs = 5.5 * 60 * 60 * 1000;
  const localTime = new Date(this.getTime() + offsetMs);
  const pad = (num) => String(num).padStart(2, '0');
  const padMs = (num) => String(num).padStart(3, '0');
  return `${localTime.getUTCFullYear()}-${pad(localTime.getUTCMonth() + 1)}-${pad(localTime.getUTCDate())}T${pad(localTime.getUTCHours())}:${pad(localTime.getUTCMinutes())}:${pad(localTime.getUTCSeconds())}.${padMs(localTime.getUTCMilliseconds())}Z`;
};

const cluster = require('cluster');
cluster.schedulingPolicy = cluster.SCHED_RR; // Force Round-Robin pattern (even on Windows)
const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config({ quiet: true });
require('colors');

const { connectDB, sequelize } = require('./config/database');
const runMigrations = require('./config/migrations');
const runSeeds = require('./config/seeds');

const isPrimary = cluster.isPrimary || cluster.isMaster;

if (isPrimary) {
  // Master / Primary Process: Setup database, run migrations, and fork workers
  const startMaster = async () => {
    try {
      console.log(`[Master Process] Running with PID: ${process.pid}`.cyan.bold);
      
      // Connect and sync database
      await connectDB();
      await sequelize.sync();
      console.log('[Master Process] Database synchronized'.green);

      // Run database migrations and seeds
      await runMigrations(sequelize);
      await runSeeds();

      // Start Auto-Extend Overdue Checkout scheduler
      const { startAutoExtendScheduler } = require('./services/autoExtendService');
      startAutoExtendScheduler();

      // Fork worker processes (one per CPU core)
      const numCPUs = os.cpus().length;
      const numWorkers = numCPUs;
      console.log(`[Master Process] Forking ${numWorkers} worker processes...`.cyan);
      
      const workersMap = new Map();
      for (let i = 0; i < numWorkers; i++) {
        const name = `W${i + 1}`;
        const worker = cluster.fork({ WORKER_NAME: name });
        workersMap.set(worker.id, name);
      }

      // Auto-restart on worker crash
      cluster.on('exit', (worker, code, signal) => {
        const name = workersMap.get(worker.id) || 'W-unknown';
        console.log(`[Master Process] Worker ${name} (PID: ${worker.process.pid}) died. Forking a new one...`.red.bold);
        workersMap.delete(worker.id);
        
        const newWorker = cluster.fork({ WORKER_NAME: name });
        workersMap.set(newWorker.id, name);
      });
    } catch (err) {
      console.error('[Master Process] Initialization failed:'.red.bold, err);
      process.exit(1);
    }
  };
  startMaster();
} else {
  // Worker Process: Setup database pool connection and handle HTTP server traffic
  const app = express();

  const hotelNameCache = new Map();

  const getHotelName = (id) => {
    if (!id) return '';
    const cached = hotelNameCache.get(String(id)) || hotelNameCache.get(Number(id));
    if (cached) return cached;

    // Fetch in background for newly created hotels
    const Hotel = require('./models/Hotel');
    Hotel.findByPk(id)
      .then(hotel => {
        if (hotel) {
          hotelNameCache.set(String(id), hotel.name);
          hotelNameCache.set(Number(id), hotel.name);
        }
      })
      .catch(() => {});

    return '';
  };

  // Connect Database pool and pre-populate hotel names cache
  connectDB().then(() => {
    const Hotel = require('./models/Hotel');
    Hotel.findAll({ attributes: ['id', 'name'] })
      .then(hotels => {
        hotels.forEach(h => {
          hotelNameCache.set(String(h.id), h.name);
          hotelNameCache.set(Number(h.id), h.name);
        });
      })
      .catch(() => {});
  });

  // Models - Import to ensure they are registered with Sequelize
  const Hotel = require('./models/Hotel');
  const User = require('./models/User');
  const Room = require('./models/Room');
  const Booking = require('./models/Booking');
  const Kot = require('./models/Kot');
  const FoodItem = require('./models/FoodItem');
  const Expense = require('./models/Expense');
  const Asset = require('./models/Asset');
  const AssetLog = require('./models/AssetLog');
  const RoomType = require('./models/RoomType');
  const ExtraCharge = require('./models/ExtraCharge');
  const ActivityLog = require('./models/ActivityLog');

  // Associations
  Hotel.hasMany(User, { foreignKey: 'hotelId' });
  User.belongsTo(Hotel, { foreignKey: 'hotelId' });

  Hotel.hasMany(RoomType, { foreignKey: 'hotelId', as: 'roomTypes', onDelete: 'CASCADE' });
  RoomType.belongsTo(Hotel, { foreignKey: 'hotelId' });

  Hotel.hasMany(Room, { foreignKey: 'hotelId' });
  Room.belongsTo(Hotel, { foreignKey: 'hotelId' });

  Hotel.hasMany(Booking, { foreignKey: 'hotelId' });
  Booking.belongsTo(Hotel, { foreignKey: 'hotelId' });

  Hotel.hasMany(FoodItem, { foreignKey: 'hotelId' });
  FoodItem.belongsTo(Hotel, { foreignKey: 'hotelId' });

  Hotel.hasMany(Kot, { foreignKey: 'hotelId' });
  Kot.belongsTo(Hotel, { foreignKey: 'hotelId' });

  Hotel.hasMany(Expense, { foreignKey: 'hotelId' });
  Expense.belongsTo(Hotel, { foreignKey: 'hotelId' });

  Room.hasMany(Booking, { foreignKey: 'roomId' });
  Booking.belongsTo(Room, { foreignKey: 'roomId' });
  Booking.belongsTo(Room, { as: 'PreviousRoom', foreignKey: 'previousRoomId' });
  Booking.hasMany(Kot, { foreignKey: 'bookingId', onDelete: 'SET NULL' });
  Kot.belongsTo(Booking, { foreignKey: 'bookingId' });

  Hotel.hasMany(Asset, { foreignKey: 'hotelId' });
  Asset.belongsTo(Hotel, { foreignKey: 'hotelId' });

  Asset.hasMany(AssetLog, { foreignKey: 'assetId', onDelete: 'CASCADE' });
  AssetLog.belongsTo(Asset, { foreignKey: 'assetId' });

  Hotel.hasMany(ExtraCharge, { foreignKey: 'hotelId', onDelete: 'CASCADE' });
  ExtraCharge.belongsTo(Hotel, { foreignKey: 'hotelId' });
  Booking.hasMany(ExtraCharge, { foreignKey: 'bookingId', onDelete: 'CASCADE' });
  ExtraCharge.belongsTo(Booking, { foreignKey: 'bookingId' });

  Hotel.hasMany(AssetLog, { foreignKey: 'hotelId' });
  AssetLog.belongsTo(Hotel, { foreignKey: 'hotelId' });

  Hotel.hasMany(ActivityLog, { foreignKey: 'hotelId' });
  ActivityLog.belongsTo(Hotel, { foreignKey: 'hotelId' });
  User.hasMany(ActivityLog, { foreignKey: 'performedByUserId' });
  ActivityLog.belongsTo(User, { foreignKey: 'performedByUserId' });

  // Middleware
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5006',
    'http://localhost:4173',
    'https://hotels.learninghub.ind.in',
    'https://newhotels.learninghub.ind.in'
  ];

  app.use(cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.includes(origin) ||
        origin.endsWith('.learninghub.ind.in') ||
        process.env.NODE_ENV === 'development';

      if (isAllowed) {
        callback(null, true);
      } else {
        console.log(`[Worker ${process.pid}] CORS blocked origin: ${origin}`);
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-hotel-id']
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Custom morgan token for Hotel ID
  morgan.token('hotel-id', (req) => {
    // Exclude for login and auth routes
    if (req.originalUrl.startsWith('/api/auth')) {
      return '';
    }

    const formatHotel = (id) => {
      const name = getHotelName(id);
      return name ? `${id} - ${name}` : id;
    };

    if (req.user?.role === 'superadmin') {
      const url = req.originalUrl;
      const hotelUrlMatch = url.match(/\/api\/hotels\/(\d+)/);
      if (hotelUrlMatch) {
        return `${formatHotel(hotelUrlMatch[1])} (SuperAdmin)`;
      }

      if (
        url.startsWith('/api/analytics/superadmin') ||
        url === '/api/hotels' ||
        url.startsWith('/api/billing-templates')
      ) {
        return 'SuperAdmin';
      }

      if (req.query && req.query.hotelId !== undefined) {
        if (req.query.hotelId) {
          return `${formatHotel(req.query.hotelId)} (SuperAdmin)`;
        }
        return 'SuperAdmin';
      }

      const hId = req.headers['x-hotel-id'];
      return hId ? `${formatHotel(hId)} (SuperAdmin)` : 'SuperAdmin';
    }

    const hotelId = (req.query?.hotelId !== undefined && req.query.hotelId !== '') 
      ? req.query.hotelId 
      : (req.headers['x-hotel-id'] || req.user?.hotelId);
    return hotelId ? formatHotel(hotelId) : '';
  });

  app.use(morgan((tokens, req, res) => {
    const status = res.statusCode;
    const color = status >= 500 ? 31 // red
      : status >= 400 ? 33 // yellow
        : status >= 300 ? 36 // cyan
          : status >= 200 ? 32 // green
            : 0; // no color

    const hotelId = tokens['hotel-id'](req, res);
    let hotelLog = '';
    if (hotelId) {
      if (hotelId === 'SuperAdmin') {
        hotelLog = ` \x1b[35m[SuperAdmin]\x1b[0m`;
      } else if (hotelId.endsWith('(SuperAdmin)')) {
        const idAndName = hotelId.replace(' (SuperAdmin)', '');
        hotelLog = ` \x1b[35m[Hotel: ${idAndName}] [SuperAdmin]\x1b[0m`;
      } else {
        hotelLog = ` \x1b[35m[Hotel: ${hotelId}]\x1b[0m`;
      }
    }

    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateTime = `\x1b[90m[${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${d.toLocaleTimeString('en-US', { hour12: true })}\x1b[90m]`;
    const workerName = process.env.WORKER_NAME || 'W';
    const workerInfo = `\x1b[36m[${workerName}]\x1b[0m`;

    return `${workerInfo} \x1b[0m${tokens.method(req, res)} ${tokens.url(req, res)} \x1b[${color}m${status}\x1b[0m ${tokens['response-time'](req, res)} ms - ${tokens.res(req, res, 'content-length') || '-'}${hotelLog} ${dateTime}`;
  }));

  // Static Files serving for Guest Documents
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // Routes
  app.use('/api/auth', require('./routes/auth.routes'));
  app.use('/api/rooms', require('./routes/room.routes'));
  app.use('/api/bookings', require('./routes/booking.routes'));
  app.use('/api/analytics', require('./routes/analytics.routes'));
  app.use('/api/kots', require('./routes/kot.routes'));
  app.use('/api/food-items', require('./routes/foodItem.routes'));
  app.use('/api/hotels', require('./routes/hotel.routes'));
  app.use('/api/billing-templates', require('./routes/billingTemplate.routes'));
  app.use('/api/expenses', require('./routes/expense.routes'));
  app.use('/api/assets', require('./routes/asset.routes'));
  app.use('/api/extra-charges', require('./routes/extracharge.routes'));
  app.use('/api/activity-logs', require('./routes/activityLog.routes'));
  app.use('/api/ai', require('./routes/ai.routes'));

  app.get('/', (req, res) => {
    res.json({ message: 'Welcome to HotelSoft API' });
  });

  // 404 Not Found Handler
  app.use((req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
      success: false,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  });

  const PORT = process.env.PORT || 5000;
  const workerName = process.env.WORKER_NAME || 'W';
  app.listen(PORT, () => {
    console.log(`[Worker Process] Started ${workerName} (PID: ${process.pid}) on port ${PORT}`.yellow.bold);
  });

  // CRASH PROTECTION - Handle unhandled promise rejections inside workers
  process.on('unhandledRejection', (err, promise) => {
    console.log(`[Worker ${process.pid}] Unhandled Rejection: ${err.message}`.red);
  });

  // CRASH PROTECTION - Handle uncaught exceptions inside workers
  process.on('uncaughtException', (err) => {
    console.log(`[Worker ${process.pid}] Uncaught Exception: ${err.message}`.red.bold);
  });
}
