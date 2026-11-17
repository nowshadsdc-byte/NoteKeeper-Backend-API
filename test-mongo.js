import mongoose from "mongoose";

const MONGODB_URI = "mongodb+srv://nowshadsdc_db_user:wPvIDa582NVkOJH7@cluster0.qorlcjh.mongodb.net/?compressors=zlib";

async function testConnection() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("✅ MongoDB Connected Successfully!");

    await mongoose.disconnect();
    console.log("Connection Closed.");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed:");
    console.error(error.message);
  }
}

testConnection();
