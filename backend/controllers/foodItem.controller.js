const FoodItem = require('../models/FoodItem');

const defaultItems = [
  // Starters
  { name: 'Veg Spring Roll', price: 150.00, category: 'Starters' },
  { name: 'Paneer Tikka', price: 240.00, category: 'Starters' },
  { name: 'Chicken Tikka', price: 280.00, category: 'Starters' },
  { name: 'Crispy Chilli Baby Corn', price: 180.00, category: 'Starters' },
  { name: 'Fish Finger', price: 300.00, category: 'Starters' },
  // Main Course
  { name: 'Paneer Butter Masala', price: 260.00, category: 'Main Course' },
  { name: 'Kadai Chicken', price: 320.00, category: 'Main Course' },
  { name: 'Dal Makhani', price: 180.00, category: 'Main Course' },
  { name: 'Mixed Veg Curry', price: 200.00, category: 'Main Course' },
  { name: 'Mutton Kasha', price: 380.00, category: 'Main Course' },
  // Rice & Breads
  { name: 'Butter Naan', price: 40.00, category: 'Rice & Breads' },
  { name: 'Tandoori Roti', price: 20.00, category: 'Rice & Breads' },
  { name: 'Veg Fried Rice', price: 180.00, category: 'Rice & Breads' },
  { name: 'Chicken Biryani', price: 290.00, category: 'Rice & Breads' },
  { name: 'Jeera Rice', price: 120.00, category: 'Rice & Breads' },
  // Beverages
  { name: 'Fresh Lime Soda', price: 60.00, category: 'Beverages' },
  { name: 'Mineral Water', price: 30.00, category: 'Beverages' },
  { name: 'Masala Chai', price: 40.00, category: 'Beverages' },
  { name: 'Cold Coffee', price: 90.00, category: 'Beverages' },
  { name: 'Soft Drink (Can)', price: 50.00, category: 'Beverages' },
  // Desserts
  { name: 'Gulab Jamun (2 pcs)', price: 80.00, category: 'Desserts' },
  { name: 'Vanilla Ice Cream', price: 60.00, category: 'Desserts' },
  { name: 'Brownie with Ice Cream', price: 150.00, category: 'Desserts' }
];

// @desc    Get all food items
// @route   GET /api/food-items
// @access  Private
exports.getFoodItems = async (req, res, next) => {
  try {
    let items = await FoodItem.findAll({ 
      where: { hotelId: req.user.hotelId },
      order: [['name', 'ASC']] 
    });
    
    // Seed default items if empty
    if (items.length === 0) {
      const itemsToSeed = defaultItems.map(item => ({ ...item, hotelId: req.user.hotelId }));
      await FoodItem.bulkCreate(itemsToSeed);
      items = await FoodItem.findAll({ 
        where: { hotelId: req.user.hotelId },
        order: [['name', 'ASC']] 
      });
    }
    
    res.status(200).json({
      success: true,
      count: items.length,
      data: items
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new food item
// @route   POST /api/food-items
// @access  Private
exports.createFoodItem = async (req, res, next) => {
  try {
    const { name, price, category } = req.body;
    
    if (!name || price === undefined || !category) {
      res.status(400);
      throw new Error('Please provide name, price, and category');
    }
    
    const existing = await FoodItem.findOne({ where: { name, hotelId: req.user.hotelId } });
    if (existing) {
      res.status(400);
      throw new Error('Food item with this name already exists in this hotel');
    }
    
    const item = await FoodItem.create({ name, price, category, hotelId: req.user.hotelId });
    
    res.status(201).json({
      success: true,
      data: item
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update food item
// @route   PUT /api/food-items/:id
// @access  Private
exports.updateFoodItem = async (req, res, next) => {
  try {
    const { name, price, category, isAvailable } = req.body;
    
    let item = await FoodItem.findOne({ where: { id: req.params.id, hotelId: req.user.hotelId } });
    if (!item) {
      res.status(404);
      throw new Error('Food item not found in this hotel');
    }
    
    if (name && name !== item.name) {
      const existing = await FoodItem.findOne({ where: { name, hotelId: req.user.hotelId } });
      if (existing) {
        res.status(400);
        throw new Error('Food item with this name already exists in this hotel');
      }
    }
    
    item = await item.update({
      name: name !== undefined ? name : item.name,
      price: price !== undefined ? price : item.price,
      category: category !== undefined ? category : item.category,
      isAvailable: isAvailable !== undefined ? isAvailable : item.isAvailable
    });
    
    res.status(200).json({
      success: true,
      data: item
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete food item
// @route   DELETE /api/food-items/:id
// @access  Private
exports.deleteFoodItem = async (req, res, next) => {
  try {
    const item = await FoodItem.findOne({ where: { id: req.params.id, hotelId: req.user.hotelId } });
    if (!item) {
      res.status(404);
      throw new Error('Food item not found in this hotel');
    }
    
    await item.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Food item deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
