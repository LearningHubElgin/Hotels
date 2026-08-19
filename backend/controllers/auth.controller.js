const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { logActivity } = require('../utils/activityLogger');

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      res.status(400);
      throw new Error('Please provide username and password');
    }

    // Check for user
    const user = await User.findOne({ where: { username } });

    if (!user) {
      await logActivity({
        req,
        moduleName: 'Authentication',
        action: 'Login Failed',
        entityType: 'User',
        description: `Login failed for non-existing username: ${username}`,
        success: false,
        failureReason: 'Invalid credentials'
      });
      res.status(401);
      throw new Error('Invalid credentials');
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      await logActivity({
        req,
        hotelId: user.hotelId,
        moduleName: 'Authentication',
        action: 'Login Failed',
        entityType: 'User',
        entityId: user.id,
        entityName: user.username,
        description: `Incorrect password entered for username: ${username}`,
        success: false,
        failureReason: 'Invalid credentials'
      });
      res.status(401);
      throw new Error('Invalid credentials');
    }

    // Create token
    const token = jwt.sign(
      { id: user.id, role: user.role, hotelId: user.hotelId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Mock req.user for logging successful login
    req.user = user;

    await logActivity({
      req,
      hotelId: user.hotelId,
      moduleName: 'Authentication',
      action: 'Login',
      entityType: 'User',
      entityId: user.id,
      entityName: user.username,
      description: `User ${user.username} successfully logged in.`
    });

    // Fetch hotel details if hotelId exists
    const Hotel = require('../models/Hotel');
    const hotel = user.hotelId ? await Hotel.findByPk(user.hotelId) : null;

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        hotelId: user.hotelId
      },
      hotel
    });
  } catch (error) {
    next(error);
  }
};
