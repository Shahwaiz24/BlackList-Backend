import { InsertedUser, RequestUser, User, UserBillingData } from "../../models/User.js";
import { Brand } from "../../models/Brand.js";
import { Refferals } from "../../models/Refferals.js";
import { decryptData, encryptData, sign, verify } from "securex";
import UserService from "../User/userService.js";
import CacheService from "../Cache/cacheService.js";
import KafkaService from "../Kafka/kafkaService.js";
import ReferralService from "../Referral/refferalService.js";
import Validator from "../../helpers/Validator.js";
import EmailService from "../Email/emailService.js";


class AuthService {
    static async registerUser(body: RequestUser) {
        try {
            const securexKey = process.env.SECUREX_KEY as string;
            const { email, password, confirmpassword, firstname, lastname, ssn, billingdata, refferalcode } = body;

            if (password !== confirmpassword) {
                throw new Error("Password and Confirm Password do not match");
            }
            const [isEmailExist, userId, isPasswordSafe] = await Promise.all([
                UserService.isUserEmailExist(email),
                UserService.generateUniqueUserId(),
                this.checkPasswordSafe(password)
            ]);

            if (isEmailExist) {
                throw new Error("Email already exists");
            }

            if (!isPasswordSafe) {
                throw new Error("Password is not safe");
            }

            const [
                decryptedSSN,
                decryptedBillingData,
                encryptedPassword
            ] = await Promise.all([
                Promise.race([
                    decryptData(ssn, securexKey),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('SSN timeout')), 5000))
                ]).catch(() => ""),

                Promise.race([
                    decryptData(billingdata, securexKey),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Billing timeout')), 5000))
                ]),

                encryptData(password, securexKey)
            ]);

            const [isSSNValid, isBillingDataValid] = await Promise.all([
                this.checkSSNValid(decryptedSSN),
                this.checkBillingDataValid(decryptedBillingData)
            ]);

            if (!isSSNValid) {
                throw new Error("Invalid SSN Token");
            }

            if (!isBillingDataValid) {
                throw new Error("Invalid Billing Data");
            }
            const tokens = await this.generateAuthTokens(userId, email, "user");
            const userAccessToken = tokens.accessToken;
            const userRefreshToken = tokens.refreshToken;

            const currentTimestamp = new Date().toISOString();
            const userBillingData: UserBillingData = {
                accountname: decryptedBillingData.accountname,
                accountnumber: decryptedBillingData.accountnumber,
                expirydate: decryptedBillingData.expirydate,
                cvv: decryptedBillingData.cvv
            };

            const insertedUser: InsertedUser = {
                userId,
                email,
                verified: false,
                role: "user",
                password: encryptedPassword,
                firstname,
                lastname,
                createdAt: currentTimestamp,
                brandid: "",
                refferalsid: "",
                billingdata: userBillingData
            };

            const completeUser: User = {
                userId,
                email,
                verified: false,
                role: "user",
                password: encryptedPassword,
                firstname,
                lastname,
                createdAt: currentTimestamp,
                brand: {} as Brand,
                refferals: {} as Refferals,
                billingdata: userBillingData
            };

            const backgroundOperations = [
                CacheService.setUser(userId, completeUser),
                KafkaService.sendUserCreateEvent(userId, insertedUser),
                EmailService.sendVerficationEmail(email, userId)
            ];
            if (refferalcode && refferalcode.trim()) {
                backgroundOperations.push(ReferralService.addRefferalUserByCode(refferalcode, userId));
            }

            Promise.allSettled(backgroundOperations).catch(error => {
                console.error("Background operations error:", error);
            });


            return {
                success: true,
                userId,
                message: "User registered successfully and verification email sent",
                userRefreshToken: userRefreshToken,
                userAccessToken: userAccessToken
            };

        } catch (error) {
            throw error;
        }
    }

    static async checkPasswordSafe(password: string) {
        const isPasswordSafe = password.length >= 6 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[!@#$%^&*]/.test(password);
        return isPasswordSafe;
    }

    static async checkSSNValid(ssn: string) {
        const regex = /^(?!000)\d{3}-(?!00)\d{2}-(?!0000)\d{4}$|^(?!000)\d{3}(?!00)\d{2}(?!0000)\d{4}$/;
        return regex.test(ssn);
    }


    static async checkBillingDataValid(billingdata: any) {
        const requiredFields = ["accountname", "accountnumber", "expirydate", "cvv"];
        const { isValid, missingFields } = Validator.validate(requiredFields, billingdata);

        if (!isValid) {
            return false;
        }

        const isBillingDataValid =
            typeof billingdata === "object" &&
            billingdata !== null &&
            Object.keys(billingdata).length > 0 &&
            missingFields.length === 0;

        return isBillingDataValid;
    }

    static async verifyEmail(token: string) {
        try {
            // Verify the token
            const tokenData = await verify(token, process.env.SECUREX_KEY as string);

            // Check if token is for email verification
            if (tokenData.type !== "verify") {
                throw new Error("Invalid verification token");
            }

            const { userId } = tokenData;

            // Get user from cache
            const user = await CacheService.getUser(userId);
            if (!user) {
                throw new Error("User not found");
            }

            // Check if already verified
            if (user.verified) {
                throw new Error("User already verified");
            }

            // Update user verification status
            const updatedUser = { ...user, verified: true };

            // Update cache with verified user
            const backgroundOperations = [
                await CacheService.setUser(userId, updatedUser),
                await KafkaService.sendUserUpdateEvent(userId, updatedUser)
            ];
            Promise.allSettled(backgroundOperations).catch(error => {
                console.error("Background operations error:", error);
            });

            return { success: true, message: "Email verified successfully" };

        } catch (error: any) {
            throw new Error(error.message || "Email verification failed");
        }
    }
    static async generateAuthTokens(userId: string, email: string, role: "user" | "admin"): Promise<{ accessToken: string, refreshToken: string }> {
        try {
            const securexKey = process.env.SECUREX_KEY as string;
            const userEncryptionData = { userId, email, role };

            const [accessToken, refreshToken] = await Promise.all([
                sign({ ...userEncryptionData, type: "access" }, securexKey, Number(process.env.ACCESS_TOKEN_EXPIRY as string)),
                sign({ ...userEncryptionData, type: "refresh" }, securexKey, Number(process.env.REFRESH_TOKEN_EXPIRY as string))
            ]);

            return { accessToken, refreshToken };
        } catch (error: any) {
            throw new Error(`Token generation failed: ${error.message || "Unknown error"}`);
        }
    }

    static async forgotPassword(userId: string) {
        try {
            const user = await CacheService.getUser(userId);
            if (!user) {
                throw new Error("User not found");
            }
            if (!user.verified) {
                throw new Error("User is not verified");
            }
            const backgroundOperations = [
                EmailService.sendForgotPasswordEmail(user.email, userId)
            ];
            Promise.allSettled(backgroundOperations).catch(error => {
                console.error("Background operations error:", error);
            });
            return { success: true, message: "Password reset email sent successfully" };
        } catch (error) {
            throw error;
        }
    }
    static async resetPassword(token: string, password: string) {
        try {
            const tokenData = await verify(token, process.env.SECUREX_KEY as string);
            if (tokenData.type !== "reset_password") {
                throw new Error("Invalid reset password token");
            }
            const { userId } = tokenData;
            const user = await CacheService.getUser(userId);
            if (!user) {
                throw new Error("User not found");
            }
            if (!user.verified) {
                throw new Error("User is not verified");
            }
            const isPasswordSafe = await this.checkPasswordSafe(password);
            if (!isPasswordSafe) {
                throw new Error("Password is not safe");
            }
            const encryptedPassword = await encryptData(password, process.env.SECUREX_KEY as string);
            const updatedUser = { ...user, "password": encryptedPassword };
            const backgroundOperations = [
                await CacheService.setUser(userId, updatedUser),
                await KafkaService.sendUserUpdateEvent(userId, updatedUser)
            ];
            Promise.allSettled(backgroundOperations).catch(error => {
                console.error("Background operations error:", error);
            });
            return { success: true, message: "Password reset successfully" };

        } catch (error: any) {
            throw new Error(error.message || "Password reset failed");
        }
    }


    static async refreshToken(refreshToken: string) {
        try {
            const tokenData = await verify(refreshToken, process.env.SECUREX_KEY as string);
            if (tokenData.type !== "refresh") {
                throw new Error("Invalid refresh token");
            }
            const { userId } = tokenData;
            const user = await CacheService.getUser(userId);
            if (!user) {
                throw new Error("User not found");
            }
            const tokens = await this.generateAuthTokens(userId, user.email, user.role);
            return { success: true, message: "Token refreshed successfully", accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
        } catch (error: any) {
            throw new Error(error?.message || "Token refresh failed");

        }
    }

}

export default AuthService;