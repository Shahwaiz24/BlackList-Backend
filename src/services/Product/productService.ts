import CacheService from "../Cache/cacheService.js";
import { Product } from "../../models/Product.js";

class ProductService {

    // Generate unique productId in format PRD001M7Q
    static async generateUniqueProductId(): Promise<string> {
        try {
            let attempts = 0;
            const maxAttempts = 100;

            while (attempts < maxAttempts) {
                // Generate random 3-digit number (001-999)
                const numPart = Math.floor(Math.random() * 999) + 1;
                const paddedNum = numPart.toString().padStart(3, '0');

                // Generate random 3-character alphanumeric (M7Q)
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let alphaPart = '';
                for (let i = 0; i < 3; i++) {
                    alphaPart += chars.charAt(Math.floor(Math.random() * chars.length));
                }

                const productId = `PRD${paddedNum}${alphaPart}`;

                // Check if productId already exists in cache
                const existingProduct = await CacheService.getProduct(productId);
                if (!existingProduct) {
                    return productId;
                }

                attempts++;
            }

            // Fallback: use timestamp if all attempts failed
            const timestamp = Date.now().toString().slice(-6);
            return `PRD${timestamp}`;
        } catch (error) {
            console.error('Error generating unique productId:', error);
            // Emergency fallback
            const emergency = Date.now().toString().slice(-9);
            return `PRD${emergency}`;
        }
    }

    // Get all products with pagination using cache service
    static async getAllProductsPaginated(page: number = 1, limit: number = 10): Promise<{ products: Product[]; total: number; totalPages: number; currentPage: number } | null> {
        try {
            if (page < 1 || limit < 1) {
                return null;
            }

            // Get products from cache service (Redis → DB fallback)
            const products = await CacheService.getAllProducts(page, limit);

            if (!products) {
                return {
                    products: [],
                    total: 0,
                    totalPages: 0,
                    currentPage: page
                };
            }

            // Calculate total from first few pages (approximation for performance)
            const totalApprox = page * limit + (products.length === limit ? limit : 0);
            const totalPages = Math.ceil(totalApprox / limit);

            return {
                products: products as Product[],
                total: products.length,
                totalPages,
                currentPage: page
            };
        } catch (error) {
            console.error('Get all products paginated error:', error);
            return null;
        }
    }

    // Get product by ID using proper layered architecture
    static async getProductById(productId: string): Promise<Product | null> {
        try {
            if (!productId) {
                return null;
            }

            // Use Cache Service instead of direct DB access (proper flow)
            const product = await CacheService.getProduct(productId);
            return product;
        } catch (error) {
            console.error('Get product by ID error:', error);
            return null;
        }
    }

    // Delete product by ID
    static async deleteProductById(productId: string): Promise<{ success: boolean; message: string }> {
        try {
            if (!productId) {
                return {
                    success: false,
                    message: 'Product ID is required'
                };
            }

            // Get product data first
            const product: Product | null = await CacheService.getProduct(productId);

            if (!product) {
                return {
                    success: false,
                    message: 'Product not found'
                };
            }

            // Delete product from cache
            await CacheService.deleteProduct(productId);

            return {
                success: true,
                message: 'Product deleted successfully'
            };
        } catch (error) {
            console.error('Delete product by ID error:', error);
            return {
                success: false,
                message: 'Internal server error'
            };
        }
    }
}

export default ProductService;
