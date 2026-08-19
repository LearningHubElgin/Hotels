const fs = require('fs');
const path = require('path');
const Hotel = require('../models/Hotel');
const User = require('../models/User');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const FoodItem = require('../models/FoodItem');
const Kot = require('../models/Kot');
const BillingTemplate = require('../models/BillingTemplate');

const runSeeds = async () => {
  // 1. Seed default billing templates dynamically from JSON files
  try {
    // Clear old templates so we always refresh them with latest configurations
    await BillingTemplate.destroy({ where: {} });

    const templatesDir = path.join(__dirname, 'templates');
    if (fs.existsSync(templatesDir)) {
      const templateFiles = fs.readdirSync(templatesDir).filter(file => file.endsWith('.json'));

      const seedTemplates = [];
      for (const file of templateFiles) {
        const templatePath = path.join(templatesDir, file);
        const templateContent = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
        const templateId = path.parse(file).name;

        seedTemplates.push({
          id: templateId,
          name: templateContent.name,
          layout: JSON.stringify(templateContent.layout),
          style: JSON.stringify(templateContent.style)
        });
      }

      if (seedTemplates.length > 0) {
        await BillingTemplate.bulkCreate(seedTemplates);
        console.log(`Seeded ${seedTemplates.length} billing templates dynamically from JSON configs.`.green);
      }
    } else {
      console.warn('Seeder Warning: backend/config/templates folder not found.'.yellow);
    }
  } catch (err) {
    console.error('Error seeding billing templates:', err.message);
  }
};

module.exports = runSeeds;
