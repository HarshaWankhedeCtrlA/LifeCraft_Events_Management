const mongoose = require('mongoose');

async function connectDatabase(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is required to connect to MongoDB');
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

module.exports = connectDatabase;
