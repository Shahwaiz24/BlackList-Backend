import { Kafka, Producer, Consumer, KafkaConfig, Admin } from 'kafkajs';
import { encryptData, decryptData } from 'securex';
import DBService from '../DB/dbService.js';

/**
 * Production-Ready Kafka Service with Batch Processing
 * - Handles CREATE, UPDATE, DELETE operations
 * - 500 documents per batch processing
 * - Automatic topic management
 * - Robust error handling and retry mechanisms
 */
class KafkaService {
    private static kafka: Kafka | null = null;
    private static producer: Producer | null = null;
    private static admin: Admin | null = null;
    private static consumers: Map<string, Consumer> = new Map();
    private static batchQueues: Map<string, any[]> = new Map();
    private static readonly BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500');
    private static readonly BATCH_TIMEOUT =
        process.env.MODE === "development" ? 50000 : 3600000;
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
                    retries: 5,
                    maxRetryTime: 20000,
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
                maxInFlightRequests: 2, // Increased from 1 to 2 for better performance
                idempotent: true,
                transactionTimeout: 20000, // Reduced from 30s to 20s
                retry: {
                    initialRetryTime: 1000,
                    retries: 3 // Reduced from 10 to 3
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
            // console.log(`Message sent to topic: ${topic}, key: ${key}`); // Removed for production performance
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
                sessionTimeout: 180000, // 3 minutes instead of 5
                heartbeatInterval: 3000,
                maxWaitTimeInMs: 10000, // 10 seconds instead of 5
                retry: {
                    initialRetryTime: 1000,
                    retries: 5 // Reduced from 10 to 5
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
            // console.log(`Batch consumer created for topic: ${topic}, groupId: ${groupId}, batch size: ${this.BATCH_SIZE}`); // Removed for production performance
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

        // console.log(`Processing batch for topic: ${topic}, size: ${batch.length}`); // Removed for production performance

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

            // console.log(`Batch processed successfully for topic: ${topic}`); // Removed for production performance
        } catch (error) {
            console.error(`Error processing batch for topic: ${topic}:`, error);
            // TODO: Implement dead letter queue for failed batches
        }
    }

    // User event producers
    static async sendUserCreateEvent(userId: string, userData: any): Promise<void> {
        const encryptedUserData = await this.encryptKafkaData(userData);
        await this.sendMessage(this.TOPICS.USER_CREATE, {
            userId,
            userData: encryptedUserData,
            operation: 'create'
        }, userId);
    }


    static async sendUserUpdateEvent(userId: string, userData: any): Promise<void> {
        const encryptedUserData = await this.encryptKafkaData(userData);
        await this.sendMessage(this.TOPICS.USER_UPDATE, {
            userId,
            userData: encryptedUserData,
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
        const encryptedProductData = await this.encryptKafkaData(productData);
        await this.sendMessage(this.TOPICS.PRODUCT_CREATE, {
            productId,
            productData: encryptedProductData,
            operation: 'create'
        }, productId);
    }

    static async sendProductUpdateEvent(productId: string, productData: any): Promise<void> {
        const encryptedProductData = await this.encryptKafkaData(productData);
        await this.sendMessage(this.TOPICS.PRODUCT_UPDATE, {
            productId,
            productData: encryptedProductData,
            operation: 'update'
        }, productId);
    }

    static async sendProductDeleteEvent(productId: string): Promise<void> {
        await this.sendMessage(this.TOPICS.PRODUCT_DELETE, {
            productId,
            operation: 'delete'
        }, productId);
    }

    // Brand event producers - WITH ENCRYPTION
    static async sendBrandCreateEvent(brandId: string, brandData: any): Promise<void> {
        const encryptedBrandData = await this.encryptKafkaData(brandData);
        await this.sendMessage(this.TOPICS.BRAND_CREATE, {
            brandId,
            brandData: encryptedBrandData,
            operation: 'create'
        }, brandId);
    }

    static async sendBrandUpdateEvent(brandId: string, brandData: any): Promise<void> {
        const encryptedBrandData = await this.encryptKafkaData(brandData);
        await this.sendMessage(this.TOPICS.BRAND_UPDATE, {
            brandId,
            brandData: encryptedBrandData,
            operation: 'update'
        }, brandId);
    }

    static async sendBrandDeleteEvent(brandId: string): Promise<void> {
        await this.sendMessage(this.TOPICS.BRAND_DELETE, {
            brandId,
            operation: 'delete'
        }, brandId);
    }
    // Encryption helper methods for Kafka data
    private static async encryptKafkaData(data: any): Promise<any> {
        try {
            const secretKey = process.env.SECUREX_KEY;
            if (!secretKey) {
                throw new Error('SECUREX_KEY not found in environment variables');
            }
            return await encryptData(data, secretKey);
        } catch (error) {
            console.error('Kafka data encryption error:', error);
            throw error;
        }
    }

    private static async decryptKafkaData(encryptedData: any): Promise<any> {
        try {
            const secretKey = process.env.SECUREX_KEY;
            if (!secretKey) {
                throw new Error('SECUREX_KEY not found in environment variables');
            }
            return await decryptData(encryptedData, secretKey);
        } catch (error) {
            console.error('Kafka data decryption error:', error);
            throw error;
        }
    }

    // Background batch processors for database operations

    // User batch processors with encryption
    private static async processUserCreateBatch(batch: any[]): Promise<void> {
        try {
            const userData = await Promise.all(batch.map(async (msg) => {
                const decryptedData = await KafkaService.decryptKafkaData(msg.userData);
                return decryptedData;
            }));

            await DBService.bulkInsert('users', userData);
            // console.log(`Successfully created ${userData.length} users in database with encryption`); // Removed for production performance
        } catch (error) {
            console.error('Error in user create batch:', error);
            throw error;
        }
    }

    private static async processUserUpdateBatch(batch: any[]): Promise<void> {
        try {
            const bulkOps = await Promise.all(batch.map(async (msg) => {
                const decryptedData = await KafkaService.decryptKafkaData(msg.userData);

                // Field-level updates instead of complete document overwrite
                const fieldUpdates: any = {
                };

                // Only update fields that are provided (field-level updates)
                if (decryptedData.email) fieldUpdates.email = decryptedData.email;
                if (decryptedData.firstname) fieldUpdates.firstname = decryptedData.firstname;
                if (decryptedData.lastname) fieldUpdates.lastname = decryptedData.lastname;
                if (decryptedData.verified !== undefined) fieldUpdates.verified = decryptedData.verified;
                if (decryptedData.brandid) fieldUpdates.brandid = decryptedData.brandid;
                if (decryptedData.refferalsid) fieldUpdates.refferalsid = decryptedData.refferalsid;

                // Handle nested referrals object updates
                if (decryptedData.refferals) {
                    if (decryptedData.refferals.userrefferalcode) {
                        fieldUpdates['refferals.userrefferalcode'] = decryptedData.refferals.userrefferalcode;
                    }
                    if (decryptedData.refferals.refferalusers) {
                        fieldUpdates['refferals.refferalusers'] = decryptedData.refferals.refferalusers;
                    }
                }

                return {
                    updateOne: {
                        filter: { userId: msg.userId },
                        update: { $set: fieldUpdates }, // Only specific fields, not entire document
                        upsert: false
                    }
                };
            }));

            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('users');
            await collection.bulkWrite(bulkOps, { ordered: false });

            // console.log(`Successfully updated ${batch.length} users with field-level updates`); // Removed for production performance
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
            await collection.deleteMany({ userId: { $in: userIds } });

            // console.log(`Successfully deleted ${userIds.length} users from database`); // Removed for production performance
        } catch (error) {
            console.error('Error in user delete batch:', error);
            throw error;
        }
    }

    // Product batch processors with encryption
    private static async processProductCreateBatch(batch: any[]): Promise<void> {
        try {
            const productData = await Promise.all(batch.map(async (msg) => {
                const decryptedData = await KafkaService.decryptKafkaData(msg.productData);
                return decryptedData;
            }));

            await DBService.bulkInsert('products', productData);
            // console.log(`Successfully created ${productData.length} products in database with encryption`); // Removed for production performance
        } catch (error) {
            console.error('Error in product create batch:', error);
            throw error;
        }
    }

    private static async processProductUpdateBatch(batch: any[]): Promise<void> {
        try {
            const bulkOps = await Promise.all(batch.map(async (msg) => {
                const decryptedData = await KafkaService.decryptKafkaData(msg.productData);

                // Field-level updates for products within productList array
                const fieldUpdates: any = {
                };

                // Only update fields that are provided (field-level updates within array)
                if (decryptedData.name) fieldUpdates['productList.$.name'] = decryptedData.name;
                if (decryptedData.description) fieldUpdates['productList.$.description'] = decryptedData.description;
                if (decryptedData.categoryid) fieldUpdates['productList.$.categoryid'] = decryptedData.categoryid;

                return {
                    updateOne: {
                        filter: {
                            'productList.productId': msg.productId
                        },
                        update: { $set: fieldUpdates }, // Field-level updates within array
                        upsert: false
                    }
                };
            }));

            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('products');
            await collection.bulkWrite(bulkOps, { ordered: false });

            // console.log(`Successfully updated ${batch.length} products with field-level updates`); // Removed for production performance
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
            await collection.deleteMany({ productId: { $in: productIds } });

            // console.log(`Successfully deleted ${productIds.length} products from database`); // Removed for production performance
        } catch (error) {
            console.error('Error in product delete batch:', error);
            throw error;
        }
    }

    // Brand batch processors with encryption
    private static async processBrandCreateBatch(batch: any[]): Promise<void> {
        try {
            const brandData = await Promise.all(batch.map(async (msg) => {
                const decryptedData = await KafkaService.decryptKafkaData(msg.brandData);
                return decryptedData;
            }));

            await DBService.bulkInsert('brands', brandData);
            // console.log(`Successfully created ${brandData.length} brands in database with encryption`); // Removed for production performance
        } catch (error) {
            console.error('Error in brand create batch:', error);
            throw error;
        }
    }

    private static async processBrandUpdateBatch(batch: any[]): Promise<void> {
        try {
            const bulkOps = await Promise.all(batch.map(async (msg) => {
                const decryptedData = await KafkaService.decryptKafkaData(msg.brandData);
                const fieldUpdates: any = {
                };
                if (decryptedData.name) fieldUpdates.name = decryptedData.name;
                if (decryptedData.yearfounded) fieldUpdates.yearfounded = decryptedData.yearfounded;
                if (decryptedData.description) fieldUpdates.description = decryptedData.description;
                if (decryptedData.logourl) fieldUpdates.logourl = decryptedData.logourl;
                if (decryptedData.distributionstates) fieldUpdates.distributionstates = decryptedData.distributionstates;
                if (decryptedData.productsdocid) fieldUpdates.productsdocid = decryptedData.productsdocid;

                return {
                    updateOne: {
                        filter: { brandid: msg.brandId },
                        update: { $set: fieldUpdates },
                        upsert: false
                    }
                };
            }));

            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('brands');
            await collection.bulkWrite(bulkOps, { ordered: false });

            // console.log(`Successfully updated ${batch.length} brands with field-level updates`); // Removed for production performance
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
            await collection.deleteMany({ brandId: { $in: brandIds } });

            // console.log(`Successfully deleted ${brandIds.length} brands from database`); // Removed for production performance
        } catch (error) {
            console.error('Error in brand delete batch:', error);
            throw error;
        }
    }

    // Initialize all background workers in proper dependency order
    static async initializeWorkers(): Promise<void> {
        console.log('Initializing Kafka background workers in proper sequence...');

        // PHASE 1: CREATE operations (dependency order: User → Brand → Product)
        await this.createBatchConsumer('user-create-workers', this.TOPICS.USER_CREATE, this.processUserCreateBatch);
        await this.createBatchConsumer('brand-create-workers', this.TOPICS.BRAND_CREATE, this.processBrandCreateBatch);
        await this.createBatchConsumer('product-create-workers', this.TOPICS.PRODUCT_CREATE, this.processProductCreateBatch);

        // PHASE 2: UPDATE operations (same hierarchy)
        await this.createBatchConsumer('user-update-workers', this.TOPICS.USER_UPDATE, this.processUserUpdateBatch);
        await this.createBatchConsumer('brand-update-workers', this.TOPICS.BRAND_UPDATE, this.processBrandUpdateBatch);
        await this.createBatchConsumer('product-update-workers', this.TOPICS.PRODUCT_UPDATE, this.processProductUpdateBatch);

        // PHASE 3: DELETE operations (reverse dependency order: Product → Brand → User)
        await this.createBatchConsumer('product-delete-workers', this.TOPICS.PRODUCT_DELETE, this.processProductDeleteBatch);
        await this.createBatchConsumer('brand-delete-workers', this.TOPICS.BRAND_DELETE, this.processBrandDeleteBatch);
        await this.createBatchConsumer('user-delete-workers', this.TOPICS.USER_DELETE, this.processUserDeleteBatch);

        console.log('All Kafka workers initialized successfully in proper sequence!');
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
