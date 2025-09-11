import express from "express";
import dotenv from "dotenv";
import mainRouter from "./routes/index.js";
import DatabaseConfig from "./config/db.js";
import CacheService from "./services/Cache/cacheService.js";
import KafkaService from "./services/Kafka/kafkaService.js";
import { generateKey } from "securex";
dotenv.config();

const PORT = process.env.PORT || 3000;
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api", mainRouter);

// Graceful shutdown handlers
const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');

    try {
        await KafkaService.closeConnections();
        await CacheService.closeConnection();
        await DatabaseConfig.closeConnection();
        console.log('All connections closed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(PORT, async () => {
    console.log(`Server is running on port http://localhost:${PORT}`);

    try {
        // Initialize database connection
        await DatabaseConfig.connectToDatabase();
        // Initialize Kafka topics and workers
        await KafkaService.ensureTopics();
        console.log('✅ Kafka topics ensured');

        // Start background workers for batch processing
        await KafkaService.initializeWorkers();
        console.log('✅ Kafka workers initialized');
        console.log('🚀 Application started successfully - Production Ready!');
    } catch (error) {
        console.error('❌ Failed to start application:', error);
        process.exit(1);
    }
});