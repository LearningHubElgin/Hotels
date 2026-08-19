const express = require('express');
const { getBillingTemplates, createBillingTemplate, deleteBillingTemplate } = require('../controllers/billingTemplate.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getBillingTemplates)
  .post(createBillingTemplate);

router.route('/:id')
  .delete(deleteBillingTemplate);

module.exports = router;
