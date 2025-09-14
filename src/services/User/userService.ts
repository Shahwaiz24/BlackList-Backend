import CacheService from "../Cache/cacheService.js";
import { User } from "../../models/User.js";

class UserService {

    // Generate unique userId in format USR001A2B
    static async generateUniqueUserId(): Promise<string> {
        try {
            let attempts = 0;
            const maxAttempts = 100;

            while (attempts < maxAttempts) {
                // Generate random 3-digit number (001-999)
                const numPart = Math.floor(Math.random() * 999) + 1;
                const paddedNum = numPart.toString().padStart(3, '0');

                // Generate random 3-character alphanumeric (A2B)
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let alphaPart = '';
                for (let i = 0; i < 3; i++) {
                    alphaPart += chars.charAt(Math.floor(Math.random() * chars.length));
                }

                const userId = `USR${paddedNum}${alphaPart}`;

                // Check if userId already exists in cache
                const existingUser = await CacheService.getUser(userId);
                if (!existingUser) {
                    return userId;
                }

                attempts++;
            }

            // Fallback: use timestamp if all attempts failed
            const timestamp = Date.now().toString().slice(-6);
            return `USR${timestamp}`;
        } catch (error) {
            console.error('Error generating unique userId:', error);
            // Emergency fallback
            const emergency = Date.now().toString().slice(-9);
            return `USR${emergency}`;
        }
    }

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
                        await CacheService.deleteProduct(product.productId);
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
    static async isUserEmailExist(email: string): Promise<boolean> {
        try {
            if (!email) {
                return false;
            }

            let currentPage = 1;
            let limit = 100;
            let userData = await this.getAllUsersPaginated(currentPage, limit);
            while (userData?.totalPages && currentPage <= userData.totalPages) {
                const allUsers = userData?.users ?? [];
                for (const user of allUsers) {
                    if (user.email === email) {
                        return true;
                    }
                }
                currentPage++;
                userData = await this.getAllUsersPaginated(currentPage, limit);

                // Break if no more users or no totalPages info
                if (!userData || !userData.users || userData.users.length === 0) {
                    break;
                }
            }
            return false;
        } catch (error) {
            console.error('Check user email exist error:', error);
            return false;
        }
    }

}

export default UserService;
