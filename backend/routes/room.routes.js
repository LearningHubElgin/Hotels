const express = require('express');
const { getRooms, addRoom, updateRoom, deleteRoom } = require('../controllers/room.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', getRooms);
router.post('/', addRoom);
router.put('/:id', updateRoom);
router.delete('/:id', deleteRoom);

module.exports = router;
