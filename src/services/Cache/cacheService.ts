import { createClient, RedisClientType } from "redis";
import { encryptData, decryptData } from "securex";
import DBService from "../DB/dbService.js";

/**
 * Cache Service with Military-Grade AES-256-GCM Encryption
 * - All cached data is encrypted using securex (quantum-resistant)
 * - Provides Redis-only caching with database fallback
 * - Handles users, products, brands with pagination support
 */
class CacheService {
    private static redisClient: RedisClientType | null = null;
    private static readonly TTL = 21600; // 6 hours
    private static isConnecting = false;
    private static connectionPromise: Promise<RedisClientType> | null = null;

    // Get Redis client with singleton pattern
    private static async getRedisClient(): Promise<RedisClientType> {
        if (this.redisClient && this.redisClient.isReady) {
            return this.redisClient;
        }

        if (this.isConnecting && this.connectionPromise) {
            return this.connectionPromise;
        }

        this.isConnecting = true;
        this.connectionPromise = this.createRedisConnection();

        try {
            this.redisClient = await this.connectionPromise;
            this.isConnecting = false;
            return this.redisClient;
        } catch (error) {
            this.isConnecting = false;
            this.connectionPromise = null;
            throw error;
        }
    }

    // Create Redis connection
    private static async createRedisConnection(): Promise<RedisClientType> {
        const client = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            socket: {
                connectTimeout: 60000,
            },
            database: 0
        }) as RedisClientType;

        client.on('error', (err: any) => {
            console.error('Redis connection error:', err);
            this.redisClient = null;
        });

        client.on('connect', () => {
            console.log('Redis connected successfully');
        });

        client.on('reconnecting', () => {
            console.log('Redis reconnecting...');
        });

        client.on('ready', () => {
            console.log('Redis client ready');
        });

        await client.connect();
        return client;
    }

    // Check Redis health
    static async isRedisHealthy(): Promise<boolean> {
        try {
            const client = await this.getRedisClient();
            await client.ping();
            return true;
        } catch (error) {
            console.error('Redis health check failed:', error);
            return false;
        }
    }

    // Close Redis connection
    static async closeConnection(): Promise<void> {
        if (this.redisClient) {
            await this.redisClient.quit();
            this.redisClient = null;
            console.log('Redis connection closed');
        }
    }

    // Encryption helper methods
    private static async encryptCacheData(data: any): Promise<string> {
        try {
            const secretKey = process.env.SECUREX_KEY;
            if (!secretKey) {
                throw new Error('SECUREX_KEY not found in environment variables');
            }
            return await encryptData(data, secretKey);
        } catch (error) {
            console.error('Cache encryption error:', error);
            throw error;
        }
    }

    private static async decryptCacheData(encryptedData: string): Promise<any> {
        try {
            const secretKey = process.env.SECUREX_KEY;
            if (!secretKey) {
                throw new Error('SECUREX_KEY not found in environment variables');
            }
            return await decryptData(encryptedData, secretKey);
        } catch (error) {
            console.error('Cache decryption error:', error);
            throw error;
        }
    }

    // User cache methods
    static async getUser(userId: string): Promise<any> {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Invalid user ID provided');
        }

        const key = `user:${userId}`;

        try {
            const client = await this.getRedisClient();
            const encryptedData = await client.get(key);

            if (encryptedData) {
                return await this.decryptCacheData(encryptedData);
            }
        } catch (error) {
            console.error('Redis get user error:', error);
        }

        try {
            const dbUser = await DBService.findById('users', userId);
            if (dbUser) {
                await this.setUser(userId, dbUser);
                return dbUser;
            }
            return null;
        } catch (error) {
            console.error('Database get user error:', error);
            throw new Error(`Failed to retrieve user with ID: ${userId}`);
        }
    }

    static async setUser(userId: string, userData: any): Promise<void> {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Invalid user ID provided');
        }

        if (!userData) {
            throw new Error('User data cannot be null or undefined');
        }

        const key = `user:${userId}`;

        try {
            const client = await this.getRedisClient();
            const encryptedData = await this.encryptCacheData(userData);
            await client.setEx(key, this.TTL, encryptedData);
        } catch (error) {
            console.error('Redis set user error:', error);
        }
    }

    static async deleteUser(userId: string): Promise<void> {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Invalid user ID provided');
        }

        const key = `user:${userId}`;

        try {
            const client = await this.getRedisClient();
            await client.del(key);
        } catch (error) {
            console.error('Redis delete user error:', error);
        }
    }

    // Product cache methods
    static async getProduct(productId: string): Promise<any> {
        if (!productId || typeof productId !== 'string') {
            throw new Error('Invalid product ID provided');
        }

        const key = `product:${productId}`;

        try {
            const client = await this.getRedisClient();
            const encryptedData = await client.get(key);

            if (encryptedData) {
                return await this.decryptCacheData(encryptedData);
            }
        } catch (error) {
            console.error('Redis get product error:', error);
        }

        try {
            const dbProduct = await DBService.findById('products', productId);
            if (dbProduct) {
                await this.setProduct(productId, dbProduct);
                return dbProduct;
            }
            return null;
        } catch (error) {
            console.error('Database get product error:', error);
            throw new Error(`Failed to retrieve product with ID: ${productId}`);
        }
    }

    static async setProduct(productId: string, productData: any): Promise<void> {
        if (!productId || typeof productId !== 'string') {
            throw new Error('Invalid product ID provided');
        }

        if (!productData) {
            throw new Error('Product data cannot be null or undefined');
        }

        const key = `product:${productId}`;

        try {
            const client = await this.getRedisClient();
            const encryptedData = await this.encryptCacheData(productData);
            await client.setEx(key, this.TTL, encryptedData);
        } catch (error) {
            console.error('Redis set product error:', error);
        }
    }

    static async deleteProduct(productId: string): Promise<void> {
        if (!productId || typeof productId !== 'string') {
            throw new Error('Invalid product ID provided');
        }

        const key = `product:${productId}`;

        try {
            const client = await this.getRedisClient();
            await client.del(key);
        } catch (error) {
            console.error('Redis delete product error:', error);
        }
    }

    // Brand cache methods
    static async getBrand(brandId: string): Promise<any> {
        if (!brandId || typeof brandId !== 'string') {
            throw new Error('Invalid brand ID provided');
        }

        const key = `brand:${brandId}`;

        try {
            const client = await this.getRedisClient();
            const encryptedData = await client.get(key);

            if (encryptedData) {
                return await this.decryptCacheData(encryptedData);
            }
        } catch (error) {
            console.error('Redis get brand error:', error);
        }

        try {
            const dbBrand = await DBService.findById('brands', brandId);
            if (dbBrand) {
                await this.setBrand(brandId, dbBrand);
                return dbBrand;
            }
            return null;
        } catch (error) {
            console.error('Database get brand error:', error);
            throw new Error(`Failed to retrieve brand with ID: ${brandId}`);
        }
    }

    static async setBrand(brandId: string, brandData: any): Promise<void> {
        if (!brandId || typeof brandId !== 'string') {
            throw new Error('Invalid brand ID provided');
        }

        if (!brandData) {
            throw new Error('Brand data cannot be null or undefined');
        }

        const key = `brand:${brandId}`;

        try {
            const client = await this.getRedisClient();
            const encryptedData = await this.encryptCacheData(brandData);
            await client.setEx(key, this.TTL, encryptedData);
        } catch (error) {
            console.error('Redis set brand error:', error);
        }
    }

    static async deleteBrand(brandId: string): Promise<void> {
        if (!brandId || typeof brandId !== 'string') {
            throw new Error('Invalid brand ID provided');
        }

        const key = `brand:${brandId}`;

        try {
            const client = await this.getRedisClient();
            await client.del(key);
        } catch (error) {
            console.error('Redis delete brand error:', error);
        }
    }

    // Paginated cache methods
    static async getAllUsers(page: number = 1, limit: number = 10): Promise<any[]> {
        if (page < 1 || limit < 1 || limit > 100) {
            throw new Error('Invalid pagination parameters: page must be >= 1, limit must be 1-100');
        }

        const key = `all_users:${page}:${limit}`;

        try {
            const client = await this.getRedisClient();
            const encryptedData = await client.get(key);

            if (encryptedData) {
                return await this.decryptCacheData(encryptedData);
            }
        } catch (error) {
            console.error('Redis get all users error:', error);
        }

        try {
            const skip = (page - 1) * limit;
            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('users');
            const dbUsers = await collection.find({}).skip(skip).limit(limit).toArray();

            if (dbUsers && dbUsers.length > 0) {
                try {
                    const client = await this.getRedisClient();
                    const encryptedData = await this.encryptCacheData(dbUsers);
                    await client.setEx(key, this.TTL, encryptedData);
                } catch (cacheError) {
                    console.error('Redis cache set error for all users:', cacheError);
                }
            }

            return dbUsers || [];
        } catch (error) {
            console.error('Database get all users error:', error);
            throw new Error(`Failed to retrieve users for page ${page}`);
        }
    }

    static async getAllProducts(page: number = 1, limit: number = 10): Promise<any[]> {
        if (page < 1 || limit < 1 || limit > 100) {
            throw new Error('Invalid pagination parameters: page must be >= 1, limit must be 1-100');
        }

        const key = `all_products:${page}:${limit}`;

        try {
            const client = await this.getRedisClient();
            const encryptedData = await client.get(key);

            if (encryptedData) {
                return await this.decryptCacheData(encryptedData);
            }
        } catch (error) {
            console.error('Redis get all products error:', error);
        }

        try {
            // Fallback to Database
            const skip = (page - 1) * limit;
            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('products');
            const dbProducts = await collection.find({}).skip(skip).limit(limit).toArray();

            if (dbProducts && dbProducts.length > 0) {
                try {
                    const client = await this.getRedisClient();
                    const encryptedData = await this.encryptCacheData(dbProducts);
                    await client.setEx(key, this.TTL, encryptedData);
                } catch (cacheError) {
                    console.error('Redis cache set error for all products:', cacheError);
                }
            }

            return dbProducts || [];
        } catch (error) {
            console.error('Database get all products error:', error);
            throw new Error(`Failed to retrieve products for page ${page}`);
        }
    }

    static async getAllBrands(page: number = 1, limit: number = 10): Promise<any[]> {
        if (page < 1 || limit < 1 || limit > 100) {
            throw new Error('Invalid pagination parameters: page must be >= 1, limit must be 1-100');
        }

        const key = `all_brands:${page}:${limit}`;

        try {
            const client = await this.getRedisClient();
            const encryptedData = await client.get(key);

            if (encryptedData) {
                return await this.decryptCacheData(encryptedData);
            }
        } catch (error) {
            console.error('Redis get all brands error:', error);
        }

        try {
            // Fallback to Database
            const skip = (page - 1) * limit;
            const database = await import("../../config/db.js");
            const db = await database.default.getDatabase();
            const collection = db.collection('brands');
            const dbBrands = await collection.find({}).skip(skip).limit(limit).toArray();

            if (dbBrands && dbBrands.length > 0) {
                try {
                    const client = await this.getRedisClient();
                    const encryptedData = await this.encryptCacheData(dbBrands);
                    await client.setEx(key, this.TTL, encryptedData);
                } catch (cacheError) {
                    console.error('Redis cache set error for all brands:', cacheError);
                }
            }

            return dbBrands || [];
        } catch (error) {
            console.error('Database get all brands error:', error);
            throw new Error(`Failed to retrieve brands for page ${page}`);
        }
    }

    // Utility methods
    static async clearEntityCache(entityType: 'user' | 'product' | 'brand'): Promise<void> {
        try {
            const client = await this.getRedisClient();
            const pattern = `${entityType}:*`;
            const keys = await client.keys(pattern);

            if (keys.length > 0) {
                await client.del(keys);
                console.log(`Cleared ${keys.length} ${entityType} cache entries`);
            }
        } catch (error) {
            console.error(`Error clearing ${entityType} cache:`, error);
        }
    }

    static async clearPaginatedCache(): Promise<void> {
        try {
            const client = await this.getRedisClient();
            const patterns = ['all_users:*', 'all_products:*', 'all_brands:*'];

            for (const pattern of patterns) {
                const keys = await client.keys(pattern);
                if (keys.length > 0) {
                    await client.del(keys);
                    console.log(`Cleared ${keys.length} paginated cache entries for pattern: ${pattern}`);
                }
            }
        } catch (error) {
            console.error('Error clearing paginated cache:', error);
        }
    }

    static async getCacheStats(): Promise<{ totalKeys: number; memoryUsage: string }> {
        try {
            const client = await this.getRedisClient();
            const info = await client.info('memory');
            const keys = await client.keys('*');

            return {
                totalKeys: keys.length,
                memoryUsage: info
            };
        } catch (error) {
            console.error('Error getting cache stats:', error);
            return {
                totalKeys: 0,
                memoryUsage: 'Unable to retrieve memory usage'
            };
        }
    }
}

export default CacheService;
