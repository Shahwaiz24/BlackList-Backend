import DatabaseConfig from "../config/db.js";
import CacheService from "../services/Cache/cacheService.js";
import KafkaService from "../services/Kafka/kafkaService.js";

class AppHelper {
    static async initializeServices() {
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
            throw error;
        }
    }

    static async gracefulShutdown() {
        console.log('🛑 Shutting down gracefully...');

        // Set a timeout to force exit if shutdown takes too long
        const shutdownTimeout = setTimeout(() => {
            console.log('⏰ Shutdown timeout reached, force exiting...');
            process.exit(1);
        }, 40000);

        try {
            console.log('📨 Closing Kafka connections...');
            await KafkaService.closeConnections();
            console.log('✅ Kafka connections closed');

            console.log('💾 Closing Redis connection...');
            await CacheService.closeConnection();
            console.log('✅ Redis connection closed');

            console.log('🗄️ Closing database connection...');
            await DatabaseConfig.closeConnection();
            console.log('✅ Database connection closed');

            clearTimeout(shutdownTimeout);
            console.log('🎉 All connections closed successfully');
            process.exit(0);
        } catch (error: any) {
            clearTimeout(shutdownTimeout);
            console.error('❌ Error during graceful shutdown:', error?.message ?? "Unknown error");
            console.log('🔄 Force exiting...');
            process.exit(1);
        }
    }
}

export default AppHelper;
