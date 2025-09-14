import dotenv from "dotenv";
dotenv.config();
import { MongoClient, Db, MongoClientOptions } from "mongodb";

const logger = console;

const MONGO_URI = process.env.MONGO_URI as string;
const DB_NAME = process.env.DB_NAME as string;

if (!MONGO_URI) {
    throw new Error("MONGO_URI environment variable is not set.");
}
if (!DB_NAME) {
    throw new Error("DB_NAME environment variable is not set.");
}

const options: MongoClientOptions = {
    connectTimeoutMS: 20000,
    socketTimeoutMS: 60000,
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 5,
};

let client: MongoClient | null = null;
let database: Db | null = null;

class DatabaseConfig {
    static async connectToDatabase(retries = 5, delay = 2000): Promise<Db> {
        if (database) {
            logger.info(`Database already connected: ${database.databaseName}`);
            return database;
        }
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                client = new MongoClient(MONGO_URI, options);
                await client.connect();

                // Test the connection
                await client.db(DB_NAME).admin().ping();

                database = client.db(DB_NAME);
                logger.info("Database connected successfully");

                process.on("SIGINT", DatabaseConfig.closeConnection);
                process.on("SIGTERM", DatabaseConfig.closeConnection);
                return database;
            } catch (error: any) {
                logger.error(`Database connection attempt ${attempt} failed:`, error?.message ?? error);

                // Clean up failed connection
                if (client) {
                    try {
                        await client.close();
                    } catch (closeError) {
                        logger.error("Error closing failed connection:", closeError);
                    }
                    client = null;
                    database = null;
                }

                if (attempt < retries) {
                    await new Promise(res => setTimeout(res, delay));
                } else {
                    throw new Error(`Failed to connect to database after ${retries} attempts. Last error: ${error?.message ?? "Unknown error"}`);
                }
            }
        }
        throw new Error("Unexpected error in database connection logic.");
    }

    static async getDatabase(): Promise<Db> {
        if (!database) {
            return await DatabaseConfig.connectToDatabase();
        }
        return database;
    }

    static async isConnected(): Promise<boolean> {
        if (!client || !database) return false;
        try {
            await client.db(DB_NAME).admin().ping();
            return true;
        } catch {
            return false;
        }
    }

    static async closeConnection() {
        try {
            if (client) {
                await client.close();
                logger.info("Database connection closed");
                client = null;
                database = null;
            }
        } catch (error: any) {
            logger.error("Error closing database connection:", error?.message ?? "Unknown error");
            client = null;
            database = null;
        }
    }
}

export default DatabaseConfig;