import { createClient, RedisClientType } from "redis";
import { encryptData, decryptData } from "securex";
import { User } from "../../models/User.js";
import { Brand } from "../../models/Brand.js";
import { Product } from "../../models/Product.js";
import DBService from "../DB/dbService.js";

/**
 * Cache Service with Military-Grade AES-256-GCM Encryption
 * - All cached data is encrypted using securex (quantum-resistant)
 * - Provides Redis-only caching with database fallback
 * - Handles users, products, brands with pagination support
 */
class CacheService {
    private static redisClient: RedisClientType | null = null;
    private static readonly TTL = 7200; // 2 hours
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

    // Helper method to populate brand with products using DBService
    private static async populateBrandProducts(insertedBrand: any): Promise<Brand> {
        try {
            // Use DBService to get populated brand instead of direct DB access
            const populatedBrand = await DBService.findBrandWithProducts(insertedBrand.brandid);

            if (populatedBrand) {
                return populatedBrand as Brand;
            }

            // Fallback: return brand without products
            return {
                brandid: insertedBrand.brandid,
                name: insertedBrand.name,
                yearfounded: insertedBrand.yearfounded,
                description: insertedBrand.description,
                logourl: insertedBrand.logourl,
                distributionstates: insertedBrand.distributionstates,
                products: []
            };
        } catch (error) {
            console.error('Error populating brand products:', error);
            // Return brand without products on error
            return {
                brandid: insertedBrand.brandid,
                name: insertedBrand.name,
                yearfounded: insertedBrand.yearfounded,
                description: insertedBrand.description,
                logourl: insertedBrand.logourl,
                distributionstates: insertedBrand.distributionstates,
                products: []
            };
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
    static async getUser(userId: string): Promise<User | null> {
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
            const dbUser = await DBService.findByField('users', 'userId', userId);
            if (dbUser) {
                const userObj = dbUser as unknown as User;
                await this.setUser(userId, userObj);
                return userObj;
            }
            return null;
        } catch (error) {
            console.error('Database get user error:', error);
            throw new Error(`Failed to retrieve user with ID: ${userId}`);
        }
    }

    static async setUser(userId: string, userData: User): Promise<void> {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Invalid user ID provided');
        }

        if (!userData || typeof userData !== 'object') {
            throw new Error('User data must be a valid User object');
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

    // Product cache methods - searches within product documents
    static async getProduct(productId: string): Promise<Product | null> {
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
            // Use DBService to find product instead of direct DB access
            const product = await DBService.findProductById(productId);

            if (product) {
                await this.setProduct(productId, product as Product);
                return product as Product;
            }
            return null;
        } catch (error) {
            console.error('Database get product error:', error);
            throw new Error(`Failed to retrieve product with ID: ${productId}`);
        }
    }

    static async setProduct(productId: string, productData: Product): Promise<void> {
        if (!productId || typeof productId !== 'string') {
            throw new Error('Invalid product ID provided');
        }

        if (!productData || typeof productData !== 'object') {
            throw new Error('Product data must be a valid Product object');
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
    static async getBrand(brandId: string): Promise<Brand | null> {
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
            const dbBrand = await DBService.findByField('brands', 'brandid', brandId);
            if (dbBrand) {
                // Get complete brand with populated products
                const completeUser = await this.populateBrandProducts(dbBrand as any);
                await this.setBrand(brandId, completeUser);
                return completeUser;
            }
            return null;
        } catch (error) {
            console.error('Database get brand error:', error);
            throw new Error(`Failed to retrieve brand with ID: ${brandId}`);
        }
    }

    static async setBrand(brandId: string, brandData: Brand): Promise<void> {
        if (!brandId || typeof brandId !== 'string') {
            throw new Error('Invalid brand ID provided');
        }

        if (!brandData || typeof brandData !== 'object') {
            throw new Error('Brand data must be a valid Brand object');
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
    static async getAllUsers(page: number = 1, limit: number = 10): Promise<User[]> {
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
            // Use DBService for paginated data instead of direct DB access
            const dbUsers = await DBService.findPaginated('users', page, limit);

            if (dbUsers && dbUsers.length > 0) {
                try {
                    const client = await this.getRedisClient();
                    const encryptedData = await this.encryptCacheData(dbUsers);
                    await client.setEx(key, this.TTL, encryptedData);
                } catch (cacheError) {
                    console.error('Redis cache set error for all users:', cacheError);
                }
            }

            return (dbUsers as unknown as User[]) || [];
        } catch (error) {
            console.error('Database get all users error:', error);
            throw new Error(`Failed to retrieve users for page ${page}`);
        }
    }

    static async getAllProducts(page: number = 1, limit: number = 10): Promise<Product[]> {
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
            // Use DBService for paginated data instead of direct DB access
            const dbProducts = await DBService.findPaginated('products', page, limit);

            if (dbProducts && dbProducts.length > 0) {
                try {
                    const client = await this.getRedisClient();
                    const encryptedData = await this.encryptCacheData(dbProducts);
                    await client.setEx(key, this.TTL, encryptedData);
                } catch (cacheError) {
                    console.error('Redis cache set error for all products:', cacheError);
                }
            }

            return (dbProducts as unknown as Product[]) || [];
        } catch (error) {
            console.error('Database get all products error:', error);
            throw new Error(`Failed to retrieve products for page ${page}`);
        }
    }

    static async getAllBrands(page: number = 1, limit: number = 10): Promise<Brand[]> {
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
            // Use DBService for paginated data instead of direct DB access
            const dbBrands = await DBService.findPaginated('brands', page, limit);

            if (dbBrands && dbBrands.length > 0) {
                try {
                    const client = await this.getRedisClient();
                    const encryptedData = await this.encryptCacheData(dbBrands);
                    await client.setEx(key, this.TTL, encryptedData);
                } catch (cacheError) {
                    console.error('Redis cache set error for all brands:', cacheError);
                }
            }

            return (dbBrands as unknown as Brand[]) || [];
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
