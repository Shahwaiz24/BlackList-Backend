import CacheService from "../Cache/cacheService.js";
import { Brand } from "../../models/Brand.js";

class BrandService {

    // Generate unique brandId in format BRD001X9K
    static async generateUniqueBrandId(): Promise<string> {
        try {
            let attempts = 0;
            const maxAttempts = 100;

            while (attempts < maxAttempts) {
                // Generate random 3-digit number (001-999)
                const numPart = Math.floor(Math.random() * 999) + 1;
                const paddedNum = numPart.toString().padStart(3, '0');

                // Generate random 3-character alphanumeric (X9K)
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let alphaPart = '';
                for (let i = 0; i < 3; i++) {
                    alphaPart += chars.charAt(Math.floor(Math.random() * chars.length));
                }

                const brandId = `BRD${paddedNum}${alphaPart}`;

                // Check if brandId already exists in cache
                const existingBrand = await CacheService.getBrand(brandId);
                if (!existingBrand) {
                    return brandId;
                }

                attempts++;
            }

            // Fallback: use timestamp if all attempts failed
            const timestamp = Date.now().toString().slice(-6);
            return `BRD${timestamp}`;
        } catch (error) {
            console.error('Error generating unique brandId:', error);
            // Emergency fallback
            const emergency = Date.now().toString().slice(-9);
            return `BRD${emergency}`;
        }
    }

    // Get all brands with pagination using cache service
    static async getAllBrandsPaginated(page: number = 1, limit: number = 10): Promise<{ brands: Brand[]; total: number; totalPages: number; currentPage: number } | null> {
        try {
            if (page < 1 || limit < 1) {
                return null;
            }

            // Get brands from cache service (Redis → DB fallback)
            const brands = await CacheService.getAllBrands(page, limit);

            if (!brands) {
                return {
                    brands: [],
                    total: 0,
                    totalPages: 0,
                    currentPage: page
                };
            }

            // Calculate total from first few pages (approximation for performance)
            const totalApprox = page * limit + (brands.length === limit ? limit : 0);
            const totalPages = Math.ceil(totalApprox / limit);

            return {
                brands: brands as Brand[],
                total: brands.length,
                totalPages,
                currentPage: page
            };
        } catch (error) {
            console.error('Get all brands paginated error:', error);
            return null;
        }
    }

    // Get brand by ID using cache service
    static async getBrandById(brandId: string): Promise<Brand | null> {
        try {
            if (!brandId) {
                return null;
            }

            const brand = await CacheService.getBrand(brandId);
            return brand as Brand;
        } catch (error) {
            console.error('Get brand by ID error:', error);
            return null;
        }
    }

    // Delete brand by ID with products cleanup
    static async deleteBrandById(brandId: string): Promise<{ success: boolean; message: string }> {
        try {
            if (!brandId) {
                return {
                    success: false,
                    message: 'Brand ID is required'
                };
            }

            // Get brand data first to find associated products
            const brand: Brand | null = await CacheService.getBrand(brandId);

            if (!brand) {
                return {
                    success: false,
                    message: 'Brand not found'
                };
            }

            // Delete brand's products if exist
            if (brand.products && brand.products.length > 0) {
                // Delete all brand products from cache
                for (const product of brand.products) {
                    await CacheService.deleteProduct(product.productId );
                }
            }

            // Delete brand from cache
            await CacheService.deleteBrand(brandId);

            return {
                success: true,
                message: 'Brand and products deleted successfully'
            };
        } catch (error) {
            console.error('Delete brand by ID error:', error);
            return {
                success: false,
                message: 'Internal server error'
            };
        }
    }
}

export default BrandService;
