// backend/chatapp/config/mongo.js
const mongoose = require("mongoose");

const connectMongo = async () => {
  const uri =
    process.env.MONGO_URI || "mongodb://localhost:27017/omnicanalidad";
  try {
    await mongoose.connect(uri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

module.exports = { connectMongo, mongoose };
