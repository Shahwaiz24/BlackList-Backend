import CacheService from "../Cache/cacheService.js";
import KafkaService from "../Kafka/kafkaService.js";
import { Refferals } from "../../models/Refferals.js";
import { User } from "../../models/User.js";

class ReferralService {

    // Get all referrals by user ID with pagination - using cache
    static async getAllReferralsByUserIdPaginated(userId: string, page: number = 1, limit: number = 10): Promise<{ referrals: Refferals['refferalusers']; total: number; totalPages: number; currentPage: number } | null> {
        try {
            if (!userId || page < 1 || limit < 1) {
                return null;
            }

            // Get user from cache
            const userData: User | null = await CacheService.getUser(userId);

            if (!userData || !userData.refferals || !userData.refferals.refferalusers) {
                return {
                    referrals: [],
                    total: 0,
                    totalPages: 0,
                    currentPage: page
                };
            }

            // Calculate pagination
            const skip = (page - 1) * limit;
            const total = userData.refferals.refferalusers.length;
            const totalPages = Math.ceil(total / limit);

            // Apply pagination to referrals array
            const paginatedReferrals = userData.refferals.refferalusers.slice(skip, skip + limit);

            return {
                referrals: paginatedReferrals,
                total,
                totalPages,
                currentPage: page
            };
        } catch (error) {
            console.error('Get referrals paginated error:', error);
            return null;
        }
    }

    // Generate new unique referral code (6 digits uppercase, numbers + letters)
    static async generateNewReferralCode(): Promise<string> {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let referralCode = '';
        let isUnique = false;

        while (!isUnique) {
            // Generate 6-digit code
            referralCode = '';
            for (let i = 0; i < 6; i++) {
                const randomIndex = Math.floor(Math.random() * characters.length);
                referralCode += characters[randomIndex];
            }

            // Check if code is unique using cache service only
            const existingUser = await this.findUserByReferralCode(referralCode);

            if (!existingUser) {
                isUnique = true;
            }
        }

        return referralCode;
    }

    // Add referred user by referral code - using cache
    static async addRefferalUserByCode(referralCode: string, newUserId: string): Promise<{ success: boolean; message: string }> {
        try {
            if (!referralCode || !newUserId) {
                return {
                    success: false,
                    message: 'Referral code and user ID are required'
                };
            }

            // Find user who owns this referral code using cache
            const referralOwner: User | null = await this.findUserByReferralCode(referralCode);

            if (!referralOwner) {
                return {
                    success: false,
                    message: 'Invalid referral code'
                };
            }

            // Get new user data from cache
            const newUser: User | null = await CacheService.getUser(newUserId);

            if (!newUser) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            // Check if user already referred
            const isAlreadyReferred = referralOwner.refferals?.refferalusers?.some(
                (refUser) => refUser.userid === newUserId
            );

            if (isAlreadyReferred) {
                return {
                    success: false,
                    message: 'User already referred'
                };
            }

            // Create new referred user object
            const newReferredUser: Refferals['refferalusers'][0] = {
                userid: newUserId,
                userfirstname: newUser.firstname,
                userlastname: newUser.lastname,
                usercreatedat: newUser.createdAt
            };

            // Update referral owner's referrals list
            if (!referralOwner.refferals) {
                referralOwner.refferals = {
                    userrefferalcode: referralCode,
                    refferalusers: []
                };
            }

            if (!referralOwner.refferals.refferalusers) {
                referralOwner.refferals.refferalusers = [];
            }

            referralOwner.refferals.refferalusers.push(newReferredUser);

            // Update cache with new data
            await CacheService.setUser(referralOwner.userId, referralOwner);

            // Send Kafka event for background database update (proper flow)
            await KafkaService.sendUserUpdateEvent(referralOwner.userId, referralOwner);

            return {
                success: true,
                message: 'User added to referral successfully'
            };
        } catch (error) {
            console.error('Add referral user error:', error);
            return {
                success: false,
                message: 'Internal server error'
            };
        }
    }

    // Helper method to find user by referral code using cache service
    private static async findUserByReferralCode(referralCode: string): Promise<User | null> {
        try {
            // Get users from cache service (Redis first → Map cache → DB fallback)
            const users = await CacheService.getAllUsers(1, 100); // Get first 100 users

            if (!users || users.length === 0) {
                return null;
            }

            // Filter to find user with matching referral code
            for (const user of users) {
                if (user.refferals && user.refferals.userrefferalcode === referralCode) {
                    // Cache individual user for future getUser calls
                    await CacheService.setUser(user.userId, user);
                    return user as User;
                }
            }
            let page = 2;
            let maxPages = 10;
            while (page <= maxPages) {
                const moreUsers = await CacheService.getAllUsers(page, 100);

                if (!moreUsers || moreUsers.length === 0) {
                    break; // No more users
                }

                for (const user of moreUsers) {
                    if (user.refferals && user.refferals.userrefferalcode === referralCode) {
                        // Cache individual user for future getUser calls
                        await CacheService.setUser(user.userId, user);
                        return user as User;
                    }
                }

                page++;
            }

            return null;
        } catch (error) {
            console.error('Find user by referral code error:', error);
            return null;
        }
    }
}

export default ReferralService;
