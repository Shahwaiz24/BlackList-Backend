import CacheService from "../Cache/cacheService.js";
import { User } from "../../models/User.js";

class UserService {

    // Get all users with pagination using cache service
    static async getAllUsersPaginated(page: number = 1, limit: number = 10): Promise<{ users: User[]; total: number; totalPages: number; currentPage: number } | null> {
        try {
            if (page < 1 || limit < 1) {
                return null;
            }

            // Get users from cache service (Redis → Map → DB fallback)
            const users = await CacheService.getAllUsers(page, limit);

            if (!users) {
                return {
                    users: [],
                    total: 0,
                    totalPages: 0,
                    currentPage: page
                };
            }

            // Calculate total from first few pages (approximation for performance)
            const totalApprox = page * limit + (users.length === limit ? limit : 0);
            const totalPages = Math.ceil(totalApprox / limit);

            return {
                users: users as User[],
                total: users.length,
                totalPages,
                currentPage: page
            };
        } catch (error) {
            console.error('Get all users paginated error:', error);
            return null;
        }
    }

    // Get user by ID using cache service
    static async getUserById(userId: string): Promise<User | null> {
        try {
            if (!userId) {
                return null;
            }

            const user = await CacheService.getUser(userId);
            return user as User;
        } catch (error) {
            console.error('Get user by ID error:', error);
            return null;
        }
    }

    // Delete user by ID with brand and products cleanup
    static async deleteUserById(userId: string): Promise<{ success: boolean; message: string }> {
        try {
            if (!userId) {
                return {
                    success: false,
                    message: 'User ID is required'
                };
            }

            // Get user data first to find associated brand
            const user: User | null = await CacheService.getUser(userId);

            if (!user) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            // Delete user's brand if exists
            if (user.brand && user.brand.brandid) {
                // Get brand to find associated products
                const brand = await CacheService.getBrand(user.brand.brandid);

                if (brand && brand.products) {
                    // Delete all brand products from cache
                    for (const product of brand.products) {
                        await CacheService.deleteProduct(product.id);
                    }
                }

                // Delete brand from cache
                await CacheService.deleteBrand(user.brand.brandid);
            }

            // Delete user from cache
            await CacheService.deleteUser(userId);

            return {
                success: true,
                message: 'User, brand, and products deleted successfully'
            };
        } catch (error) {
            console.error('Delete user by ID error:', error);
            return {
                success: false,
                message: 'Internal server error'
            };
        }
    }
}

export default UserService;
