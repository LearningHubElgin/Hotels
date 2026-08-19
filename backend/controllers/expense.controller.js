const Expense = require('../models/Expense');
const { Op } = require('sequelize');
const { logActivity } = require('../utils/activityLogger');

// @desc    Create a new expense
// @route   POST /api/expenses
// @access  Private (Hotel User)
exports.createExpense = async (req, res, next) => {
  try {
    const { title, category, amount, date, description, paymentMode, paymentBank } = req.body;

    if (!title || !category || !amount || !date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (title, category, amount, date)'
      });
    }

    const expense = await Expense.create({
      title,
      category,
      amount,
      date,
      description,
      paymentMode: paymentMode || 'Cash',
      paymentBank: paymentMode === 'Online' ? paymentBank : null,
      hotelId: req.user.hotelId
    });

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Inventory',
      action: 'Item Added',
      entityType: 'Expense',
      entityId: expense.id,
      entityName: expense.title,
      description: `Expense item '${expense.title}' of ₹${expense.amount} under category '${expense.category}' was added by ${req.user.username}.`,
      newValue: expense
    });

    res.status(201).json({
      success: true,
      data: expense
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all expenses for the active hotel
// @route   GET /api/expenses
// @access  Private (Hotel User)
exports.getExpenses = async (req, res, next) => {
  try {
    const { category, startDate, endDate } = req.query;
    const whereClause = { hotelId: req.user.hotelId };

    if (category) {
      whereClause.category = category;
    }

    if (startDate && endDate) {
      whereClause.date = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause.date = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause.date = {
        [Op.lte]: endDate
      };
    }

    const expenses = await Expense.findAll({
      where: whereClause,
      order: [['date', 'DESC'], ['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update an expense
// @route   PUT /api/expenses/:id
// @access  Private (Hotel User)
exports.updateExpense = async (req, res, next) => {
  try {
    const { title, category, amount, date, description, paymentMode, paymentBank } = req.body;

    let expense = await Expense.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found or unauthorized'
      });
    }

    const oldExpenseData = expense.toJSON();
    expense = await expense.update({
      title,
      category,
      amount,
      date,
      description,
      paymentMode: paymentMode || 'Cash',
      paymentBank: paymentMode === 'Online' ? paymentBank : null
    });

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Inventory',
      action: 'Item Updated',
      entityType: 'Expense',
      entityId: expense.id,
      entityName: expense.title,
      description: `Expense item '${expense.title}' was updated by ${req.user.username}.`,
      oldValue: oldExpenseData,
      newValue: expense
    });

    res.status(200).json({
      success: true,
      data: expense
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete an expense
// @route   DELETE /api/expenses/:id
// @access  Private (Hotel User)
exports.deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOne({
      where: { id: req.params.id, hotelId: req.user.hotelId }
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found or unauthorized'
      });
    }

    const deletedExpenseData = expense.toJSON();
    await expense.destroy();

    await logActivity({
      req,
      hotelId: req.user.hotelId,
      moduleName: 'Inventory',
      action: 'Item Deleted',
      entityType: 'Expense',
      entityId: expense.id,
      entityName: expense.title,
      description: `Expense item '${expense.title}' of ₹${expense.amount} was deleted by ${req.user.username}.`,
      oldValue: deletedExpenseData
    });

    res.status(200).json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
