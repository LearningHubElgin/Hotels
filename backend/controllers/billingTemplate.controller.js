const BillingTemplate = require('../models/BillingTemplate');

// @desc    Get all billing templates
// @route   GET /api/billing-templates
// @access  Private
exports.getBillingTemplates = async (req, res, next) => {
  try {
    const templates = await BillingTemplate.findAll({
      order: [['createdAt', 'ASC']]
    });

    // Parse layout and style JSON strings
    const parsedTemplates = templates.map(t => {
      let layoutParsed = [];
      let styleParsed = {};
      try {
        layoutParsed = JSON.parse(t.layout);
      } catch (err) {
        layoutParsed = t.layout;
      }
      try {
        styleParsed = JSON.parse(t.style);
      } catch (err) {
        styleParsed = t.style;
      }
      return {
        id: t.id,
        name: t.name,
        layout: layoutParsed,
        style: styleParsed,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      };
    });

    res.status(200).json({
      success: true,
      count: parsedTemplates.length,
      data: parsedTemplates
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Import/Create a new billing template
// @route   POST /api/billing-templates
// @access  Private (SuperAdmin)
exports.createBillingTemplate = async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') {
      res.status(403);
      throw new Error('Not authorized to create billing templates');
    }

    const { id, name, layout, style } = req.body;

    if (!name || !layout || !style) {
      res.status(400);
      throw new Error('Please provide name, layout, and style properties');
    }

    const templateId = id || `template_${Date.now()}`;
    const layoutStr = Array.isArray(layout) ? JSON.stringify(layout) : layout;
    const styleStr = typeof style === 'object' ? JSON.stringify(style) : style;

    const template = await BillingTemplate.create({
      id: templateId,
      name,
      layout: layoutStr,
      style: styleStr
    });

    res.status(201).json({
      success: true,
      data: {
        id: template.id,
        name: template.name,
        layout: Array.isArray(layout) ? layout : JSON.parse(template.layout),
        style: typeof style === 'object' ? style : JSON.parse(template.style)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a billing template
// @route   DELETE /api/billing-templates/:id
// @access  Private (SuperAdmin)
exports.deleteBillingTemplate = async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') {
      res.status(403);
      throw new Error('Not authorized to delete billing templates');
    }

    const { id } = req.params;

    // Do not allow deleting template_1 (fallback default)
    if (id === 'template_1') {
      res.status(400);
      throw new Error('Default template cannot be deleted');
    }

    const template = await BillingTemplate.findByPk(id);
    if (!template) {
      res.status(404);
      throw new Error('Billing template not found');
    }

    await template.destroy();

    res.status(200).json({
      success: true,
      message: 'Billing template deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
