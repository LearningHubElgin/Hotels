const { Sequelize } = require('sequelize');
const cluster = require('cluster');
require('dotenv').config({ quiet: true });
require('colors');

const isPrimary = cluster.isPrimary || cluster.isMaster;

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false, // STOP PRINTING LARGE DATA TO TERMINAL
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    if (isPrimary) {
      console.log(`MySQL Connected successfully.${process.env.DB_NAME}`.cyan.underline);
    }
  } catch (error) {
    console.error(`Unable to connect to the database:`.red.bold, error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
