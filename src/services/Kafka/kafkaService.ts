import { Kafka, Producer, Consumer, KafkaConfig, Admin } from 'kafkajs';
import DBService from '../DB/dbService.js';

/**
 * Production-Ready Kafka Service with Batch Processing
 * - Handles CREATE, UPDATE, DELETE operations
 * - 2000 documents per batch processing
 * - Automatic topic management
 * - Robust error handling and retry mechanisms
 */
class KafkaService {
    private static kafka: Kafka | null = null;
    private static producer: Producer | null = null;
    private static admin: Admin | null = null;
    private static consumers: Map<string, Consumer> = new Map();
    private static batchQueues: Map<string, any[]> = new Map();
    private static readonly BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '2000');
    private static readonly BATCH_TIMEOUT = 30000; // 30 seconds
    private static batchTimers: Map<string, NodeJS.Timeout> = new Map();

    // Topic configuration
    private static readonly TOPICS = {
        USER_CREATE: 'user-create-queue',
        USER_UPDATE: 'user-update-queue',
        USER_DELETE: 'user-delete-queue',
        PRODUCT_CREATE: 'product-create-queue',
        PRODUCT_UPDATE: 'product-update-queue',
        PRODUCT_DELETE: 'product-delete-queue',
        BRAND_CREATE: 'brand-create-queue',
        BRAND_UPDATE: 'brand-update-queue',
        BRAND_DELETE: 'brand-delete-queue'
    };

    // Initialize Kafka with production-ready configuration
    private static getKafka(): Kafka {
        if (!this.kafka) {
            const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
            const config: KafkaConfig = {
                clientId: process.env.KAFKA_CLIENT_ID || 'blacklist-backend',
                brokers,
                connectionTimeout: 30000,
                authenticationTimeout: 30000,
                reauthenticationThreshold: 10000,
                requestTimeout: 60000,
                retry: {
                    initialRetryTime: 1000,
                    retries: 10,
                    maxRetryTime: 30000,
                    multiplier: 2
                }
            };

            // Add authentication if credentials are provided
            if (process.env.KAFKA_USERNAME && process.env.KAFKA_PASSWORD) {
                config.sasl = {
                    mechanism: 'plain',
                    username: process.env.KAFKA_USERNAME,
                    password: process.env.KAFKA_PASSWORD
                };
                config.ssl = true;
            }

            this.kafka = new Kafka(config);
        }
        return this.kafka;
    }

    // Get Admin client for topic management
    private static async getAdmin(): Promise<Admin> {
        if (!this.admin) {
            const kafka = this.getKafka();
            this.admin = kafka.admin();
            await this.admin.connect();
            console.log('Kafka admin connected');
        }
        return this.admin;
    }

    // Ensure all required topics exist
    static async ensureTopics(): Promise<void> {
        try {
            const admin = await this.getAdmin();
            const existingTopics = await admin.listTopics();

            const topicsToCreate = Object.values(this.TOPICS).filter(
                topic => !existingTopics.includes(topic)
            );

            if (topicsToCreate.length > 0) {
                await admin.createTopics({
                    topics: topicsToCreate.map(topic => ({
                        topic,
                        numPartitions: 3,
                        replicationFactor: 1,
                        configEntries: [
                            { name: 'cleanup.policy', value: 'delete' },
                            { name: 'retention.ms', value: '86400000' }, // 24 hours
                            { name: 'segment.ms', value: '3600000' } // 1 hour
                        ]
                    }))
                });
                console.log(`Created topics: ${topicsToCreate.join(', ')}`);
            }
        } catch (error) {
            console.error('Error ensuring topics:', error);
            throw error;
        }
    }

    // Get producer instance with production configuration
    private static async getProducer(): Promise<Producer> {
        if (!this.producer) {
            const kafka = this.getKafka();
            this.producer = kafka.producer({
                maxInFlightRequests: 1,
                idempotent: true,
                transactionTimeout: 30000,
                retry: {
                    initialRetryTime: 1000,
                    retries: 10
                }
            });
            await this.producer.connect();
            console.log('Kafka producer connected');
        }
        return this.producer;
    }

    // Send message to topic with retry mechanism
    static async sendMessage(topic: string, message: any, key?: string): Promise<void> {
        try {
            await this.ensureTopics();
            const producer = await this.getProducer();
            await producer.send({
                topic,
                messages: [{
                    key: key || null,
                    value: JSON.stringify({
                        ...message,
                        messageId: `${Date.now()}-${Math.random()}`,
                        timestamp: new Date().toISOString(),
                        retryCount: 0
                    }),
                    timestamp: Date.now().toString()
                }]
            });
            console.log(`Message sent to topic: ${topic}, key: ${key}`);
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    // Create consumer with batch processing
    private static async createBatchConsumer(groupId: string, topic: string, batchProcessor: (batch: any[]) => Promise<void>): Promise<void> {
        try {
            await this.ensureTopics();
            const kafka = this.getKafka();
            const consumer = kafka.consumer({
                groupId,
                sessionTimeout: 300000,
                heartbeatInterval: 3000,
                maxWaitTimeInMs: 5000,
                retry: {
                    initialRetryTime: 1000,
                    retries: 10
                }
            });

            await consumer.connect();
            await consumer.subscribe({ topic });

            // Initialize batch queue for this topic
            this.batchQueues.set(topic, []);

            await consumer.run({
                eachMessage: async ({ message }) => {
                    try {
                        if (message.value) {
                            const messageData = JSON.parse(message.value.toString());
                            await this.addToBatch(topic, messageData, batchProcessor);
                        }
                    } catch (error) {
                        console.error('Error processing message:', error);
                    }
                }
            });

            this.consumers.set(`${groupId}-${topic}`, consumer);
            console.log(`Batch consumer created for topic: ${topic}, groupId: ${groupId}, batch size: ${this.BATCH_SIZE}`);
        } catch (error) {
            console.error('Error creating batch consumer:', error);
            throw error;
        }
    }

    // Add message to batch and process when full
    private static async addToBatch(topic: string, message: any, batchProcessor: (batch: any[]) => Promise<void>): Promise<void> {
        const batch = this.batchQueues.get(topic) || [];
        batch.push(message);
        this.batchQueues.set(topic, batch);

        // Clear existing timer
        const existingTimer = this.batchTimers.get(topic);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Process batch if it reaches the limit
        if (batch.length >= this.BATCH_SIZE) {
            await this.processBatch(topic, batchProcessor);
        } else {
            // Set timer to process batch after timeout
            const timer = setTimeout(async () => {
                await this.processBatch(topic, batchProcessor);
            }, this.BATCH_TIMEOUT);
            this.batchTimers.set(topic, timer);
        }
    }

    // Process accumulated batch
    private static async processBatch(topic: string, batchProcessor: (batch: any[]) => Promise<void>): Promise<void> {
        const batch = this.batchQueues.get(topic) || [];
        if (batch.length === 0) return;

        console.log(`Processing batch for topic: ${topic}, size: ${batch.length}`);

        try {
            await batchProcessor([...batch]);
            // Clear processed batch
            this.batchQueues.set(topic, []);

            // Clear timer
            const timer = this.batchTimers.get(topic);
            if (timer) {
                clearTimeout(timer);
                this.batchTimers.delete(topic);
            }

            console.log(`Batch processed successfully for topic: ${topic}`);
        } catch (error) {
            console.error(`Error processing batch for topic: ${topic}:`, error);
            // TODO: Implement dead letter queue for failed batches
        }
    }

    // User event producers
    static async sendUserCreateEvent(userId: string, userData: any): Promise<void> {
        await this.sendMessage(this.TOPICS.USER_CREATE, {
            userId,
            userData,
            operation: 'create'
        }, userId);
    }

    static async sendUserUpdateEvent(userId: string, userData: any): Promise<void> {
        await this.sendMessage(this.TOPICS.USER_UPDATE, {
            userId,
            userData,
            operation: 'update'
        }, userId);
    }

    static async sendUserDeleteEvent(userId: string): Promise<void> {
        await this.sendMessage(this.TOPICS.USER_DELETE, {
            userId,
            operation: 'delete'
        }, userId);
    }

    // Product event producers
    static async sendProductCreateEvent(productId: string, productData: any): Promise<void> {
        await this.sendMessage(this.TOPICS.PRODUCT_CREATE, {
            productId,
            productData,
            operation: 'create'
        }, productId);
    }

    static async sendProductUpdateEvent(productId: string, productData: any): Promise<void> {
        await this.sendMessage(this.TOPICS.PRODUCT_UPDATE, {
            productId,
            productData,
            operation: 'update'
        }, productId);
    }

    static async sendProductDeleteEvent(productId: string): Promise<void> {
        await this.sendMessage(this.TOPICS.PRODUCT_DELETE, {
            productId,
            operation: 'delete'
        }, productId);
    }

    // Brand event producers
    static async sendBrandCreateEvent(brandId: string, brandData: any): Promise<void> {
        await this.sendMessage(this.TOPICS.BRAND_CREATE, {
            brandId,
            brandData,
            operation: 'create'
        }, brandId);
    }

    static async sendBrandUpdateEvent(brandId: string, brandData: any): Promise<void> {
        await this.sendMessage(this.TOPICS.BRAND_UPDATE, {
            brandId,
            brandData,
            operation: 'update'
        }, brandId);
    }

    static async sendBrandDeleteEvent(brandId: string): Promise<void> {
        await this.sendMessage(this.TOPICS.BRAND_DELETE, {
            brandId,
            operation: 'delete'
        }, brandId);
    }

    // Background batch processors for database operations

    // User batch processors
    private static async processUserCreateBatch(batch: any[]): Promise<void> {
        const userData = batch.map(msg => ({
            ...msg.userData,
            _id: msg.userId,
            createdAt: new Date().toISOString()
        }));

        try {
            await DBService.bulkInsert('users', userData);
            console.log(`Successfully created ${userData.length} users in database`);
        } catch (error) {
            console.error('Error in user create batch:', error);
            throw error;
        }
    }

    private static async processUserUpdateBatch(batch: any[]): Promise<void> {
        try {
            const bulkOps = batch.map(msg => ({
                updateOne: {
                    filter: { _id: msg.userId },
                    update: { $set: { ...msg.userData, updatedAt: new Date().toISOString() } }
                }
            }));

            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('users');
            await collection.bulkWrite(bulkOps);

            console.log(`Successfully updated ${batch.length} users in database`);
        } catch (error) {
            console.error('Error in user update batch:', error);
            throw error;
        }
    }

    private static async processUserDeleteBatch(batch: any[]): Promise<void> {
        try {
            const userIds = batch.map(msg => msg.userId);
            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('users');
            await collection.deleteMany({ _id: { $in: userIds } });

            console.log(`Successfully deleted ${userIds.length} users from database`);
        } catch (error) {
            console.error('Error in user delete batch:', error);
            throw error;
        }
    }

    // Product batch processors
    private static async processProductCreateBatch(batch: any[]): Promise<void> {
        const productData = batch.map(msg => ({
            ...msg.productData,
            _id: msg.productId,
            createdAt: new Date().toISOString()
        }));

        try {
            await DBService.bulkInsert('products', productData);
            console.log(`Successfully created ${productData.length} products in database`);
        } catch (error) {
            console.error('Error in product create batch:', error);
            throw error;
        }
    }

    private static async processProductUpdateBatch(batch: any[]): Promise<void> {
        try {
            const bulkOps = batch.map(msg => ({
                updateOne: {
                    filter: { _id: msg.productId },
                    update: { $set: { ...msg.productData, updatedAt: new Date().toISOString() } }
                }
            }));

            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('products');
            await collection.bulkWrite(bulkOps);

            console.log(`Successfully updated ${batch.length} products in database`);
        } catch (error) {
            console.error('Error in product update batch:', error);
            throw error;
        }
    }

    private static async processProductDeleteBatch(batch: any[]): Promise<void> {
        try {
            const productIds = batch.map(msg => msg.productId);
            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('products');
            await collection.deleteMany({ _id: { $in: productIds } });

            console.log(`Successfully deleted ${productIds.length} products from database`);
        } catch (error) {
            console.error('Error in product delete batch:', error);
            throw error;
        }
    }

    // Brand batch processors
    private static async processBrandCreateBatch(batch: any[]): Promise<void> {
        const brandData = batch.map(msg => ({
            ...msg.brandData,
            _id: msg.brandId,
            createdAt: new Date().toISOString()
        }));

        try {
            await DBService.bulkInsert('brands', brandData);
            console.log(`Successfully created ${brandData.length} brands in database`);
        } catch (error) {
            console.error('Error in brand create batch:', error);
            throw error;
        }
    }

    private static async processBrandUpdateBatch(batch: any[]): Promise<void> {
        try {
            const bulkOps = batch.map(msg => ({
                updateOne: {
                    filter: { _id: msg.brandId },
                    update: { $set: { ...msg.brandData, updatedAt: new Date().toISOString() } }
                }
            }));

            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('brands');
            await collection.bulkWrite(bulkOps);

            console.log(`Successfully updated ${batch.length} brands in database`);
        } catch (error) {
            console.error('Error in brand update batch:', error);
            throw error;
        }
    }

    private static async processBrandDeleteBatch(batch: any[]): Promise<void> {
        try {
            const brandIds = batch.map(msg => msg.brandId);
            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('brands');
            await collection.deleteMany({ _id: { $in: brandIds } });

            console.log(`Successfully deleted ${brandIds.length} brands from database`);
        } catch (error) {
            console.error('Error in brand delete batch:', error);
            throw error;
        }
    }

    // Initialize all background workers
    static async initializeWorkers(): Promise<void> {
        console.log('Initializing Kafka background workers...');

        // User workers
        await this.createBatchConsumer('user-create-workers', this.TOPICS.USER_CREATE, this.processUserCreateBatch);
        await this.createBatchConsumer('user-update-workers', this.TOPICS.USER_UPDATE, this.processUserUpdateBatch);
        await this.createBatchConsumer('user-delete-workers', this.TOPICS.USER_DELETE, this.processUserDeleteBatch);

        // Product workers
        await this.createBatchConsumer('product-create-workers', this.TOPICS.PRODUCT_CREATE, this.processProductCreateBatch);
        await this.createBatchConsumer('product-update-workers', this.TOPICS.PRODUCT_UPDATE, this.processProductUpdateBatch);
        await this.createBatchConsumer('product-delete-workers', this.TOPICS.PRODUCT_DELETE, this.processProductDeleteBatch);

        // Brand workers
        await this.createBatchConsumer('brand-create-workers', this.TOPICS.BRAND_CREATE, this.processBrandCreateBatch);
        await this.createBatchConsumer('brand-update-workers', this.TOPICS.BRAND_UPDATE, this.processBrandUpdateBatch);
        await this.createBatchConsumer('brand-delete-workers', this.TOPICS.BRAND_DELETE, this.processBrandDeleteBatch);

        console.log('All Kafka workers initialized successfully');
    }

    // Health check
    static async isHealthy(): Promise<boolean> {
        try {
            const admin = await this.getAdmin();
            await admin.listTopics();
            return true;
        } catch (error) {
            console.error('Kafka health check failed:', error);
            return false;
        }
    }

    // Close all connections
    static async closeConnections(): Promise<void> {
        try {
            // Clear all batch timers
            for (const timer of this.batchTimers.values()) {
                clearTimeout(timer);
            }
            this.batchTimers.clear();
            this.batchQueues.clear();

            // Close producer
            if (this.producer) {
                await this.producer.disconnect();
                this.producer = null;
                console.log('Kafka producer disconnected');
            }

            // Close all consumers
            for (const [key, consumer] of this.consumers.entries()) {
                await consumer.disconnect();
                console.log(`Consumer ${key} disconnected`);
            }
            this.consumers.clear();

            // Close admin
            if (this.admin) {
                await this.admin.disconnect();
                this.admin = null;
                console.log('Kafka admin disconnected');
            }

            console.log('All Kafka connections closed');
        } catch (error) {
            console.error('Error closing Kafka connections:', error);
        }
    }
}

export default KafkaService;
