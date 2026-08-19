const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    res.status(401);
    return next(new Error('Not authorized to access this route, token missing'));
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await User.findByPk(decoded.id);

    if (!user) {
      res.status(401);
      return next(new Error('User no longer exists'));
    }

    // Attach user to request
    req.user = user;

    // Multi-tenant hotel scoping:
    // If user is superadmin, they can switch active hotel scope via header or query parameter.
    // Otherwise, restrict them to their assigned hotelId.
    if (user.role === 'superadmin') {
      const activeHotelId = req.headers['x-hotel-id'] || req.query.hotelId;
      req.user.hotelId = activeHotelId || user.hotelId || decoded.hotelId;
    } else {
      req.user.hotelId = user.hotelId || decoded.hotelId;
    }

    next();
  } catch (error) {
    res.status(401);
    return next(new Error('Not authorized, token invalid or expired'));
  }
};

// Middleware to restrict access based on roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403);
      return next(new Error(`User role '${req.user ? req.user.role : ''}' is not authorized to access this route`));
    }
    next();
  };
};
