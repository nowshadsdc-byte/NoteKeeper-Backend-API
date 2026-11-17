import "dotenv/config";
import app from "./app.js";
import { assertJwtConfiguration } from "./config/jwt.js";
import connectDB from "./config/database.js";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async (): Promise<void> => {
  try {
    assertJwtConfiguration();
    await connectDB(); 

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API: http://localhost:${PORT}`);
    });
    
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();