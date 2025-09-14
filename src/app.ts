import express from "express";
import dotenv from "dotenv";
import mainRouter from "./routes/index.js";
import AppHelper from "./helpers/AppHelper.js";
dotenv.config();

const PORT = process.env.PORT || 3000;
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", async (req, res) => {
    try {
        const DatabaseConfig = await import("./config/db.js");
        const CacheService = await import("./services/Cache/cacheService.js");
        const KafkaService = await import("./services/Kafka/kafkaService.js");

        const dbStatus = await DatabaseConfig.default.isConnected();
        const cacheStatus = await CacheService.default.isRedisHealthy();
        const kafkaStatus = await KafkaService.default.isHealthy();

        res.status(200).json({
            status: "ok",
            timestamp: new Date().toISOString(),
            services: {
                database: dbStatus ? "connected" : "disconnected",
                cache: cacheStatus ? "connected" : "disconnected",
                kafka: kafkaStatus ? "connected" : "disconnected"
            }
        });
    } catch (error: any) {
        res.status(500).json({
            status: "error",
            message: error?.message ?? "Health check failed"
        });
    }
});

// Routes
app.use("/api", mainRouter);

// Graceful shutdown handlers
process.on('SIGTERM', AppHelper.gracefulShutdown);
process.on('SIGINT', AppHelper.gracefulShutdown);

app.listen(PORT, async () => {
    console.log(`Server is running on port http://localhost:${PORT}`);

    try {
        await AppHelper.initializeServices();
    } catch (error) {
        console.error('❌ Failed to start application:', error);
        process.exit(1);
    }
});