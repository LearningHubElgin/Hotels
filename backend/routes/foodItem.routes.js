const express = require('express');
const { getFoodItems, createFoodItem, updateFoodItem, deleteFoodItem } = require('../controllers/foodItem.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', getFoodItems);
router.post('/', createFoodItem);
router.put('/:id', updateFoodItem);
router.delete('/:id', deleteFoodItem);

module.exports = router;
