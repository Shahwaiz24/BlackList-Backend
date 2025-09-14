import { Request, Response } from "express";
import Validator from "../../helpers/Validator.js";
import ResponseHandler from "../../helpers/ResponseHandler.js";
import AuthService from "../../services/Auth/authService.js";

class AuthController {
    static async register(req: Request, res: Response) {
        try {
            let body = req.body ?? {};
            const requiredFields = ["email", "password", "confirmpassword", "firstname", "lastname", "ssn", "billingdata"];
            const { isValid, missingFields } = Validator.validate(requiredFields, body);
            if (!isValid) {
                return ResponseHandler.sendResponse(res, 400, false, "Please fill in all the required fields.", missingFields);
            }

            const { email, password, confirmpassword, firstname, lastname, ssn, billingdata, refferalcode } = body;
            const result = await AuthService.registerUser({
                email, password, confirmpassword, firstname, lastname, ssn, billingdata, refferalcode
            });

            return ResponseHandler.sendResponse(res, 201, true, result.message, {
                refreshToken: result.userRefreshToken,
                accessToken: result.userAccessToken,
                userId: result.userId,
                success: result.success
            });

        } catch (error: any) {
            console.error('Register user error:', error?.message ?? "Unknown error");
            return ResponseHandler.sendResponse(res, 400, false, error.message || "Registration failed", null);
        }
    };
    static async login(req: Request, res: Response) {
        res.status(200).send({ message: "Login endpoint" });
        return;
    };

    static async verifyEmail(req: Request, res: Response) {
        try {
            // Support both query parameter and body token
            const token = req.query.token ? String(req.query.token) : req.body.token;

            if (!token) {
                return ResponseHandler.sendResponse(res, 400, false, "Verification link is not valid", null);
            }
            const result = await AuthService.verifyEmail(token);
            return ResponseHandler.sendResponse(res, 200, true, result.message, null);

        } catch (error: any) {
            console.error('Verify email error:', error?.message ?? "Unknown error");
            return ResponseHandler.sendResponse(res, 400, false, error.message || "Email verification failed", null);
        }
    };
    static async forgotPassword(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            if (!userId) {
                return ResponseHandler.sendResponse(res, 400, false, "User ID is required", null);
            }
            const result = await AuthService.forgotPassword(userId);
            return ResponseHandler.sendResponse(res, 200, true, result.message, null);
        } catch (error: any) {
            console.error('Forgot password error:', error?.message ?? "Unknown error");
            return ResponseHandler.sendResponse(res, 400, false, error.message || "Password reset failed", null);
        }

    }
    static async resetPassword(req: Request, res: Response) {
        try {
            const token = req.query.token ? String(req.query.token) : req.body.token;
            if (!token) {
                return ResponseHandler.sendResponse(res, 400, false, "Password reset link is not valid", null);
            }
            const { password, confirmpassword } = req.body ?? {};
            const requiredFields = ["password", "confirmpassword"];
            const { isValid, missingFields } = Validator.validate(requiredFields, req.body);
            if (!isValid) {
                return ResponseHandler.sendResponse(res, 400, false, "Please fill in all the required fields.", missingFields);
            }
            if (password !== confirmpassword) {
                return ResponseHandler.sendResponse(res, 400, false, "Password and Confirm Password do not match", null);
            }
            const result = await AuthService.resetPassword(token, password);
            return ResponseHandler.sendResponse(res, 200, true, result.message, null);
        } catch (error: any) {
            return ResponseHandler.sendResponse(res, 400, false, error?.message || "Password reset failed", null);
        }
    }
    static async refreshToken(req: Request, res: Response) {
        try {
            const { refreshToken } = req.body ?? {};
            if (!refreshToken) {
                return ResponseHandler.sendResponse(res, 400, false, "Refresh token is required", null);
            }
            const result = await AuthService.refreshToken(refreshToken);
            return ResponseHandler.sendResponse(res, 200, true, result.message, {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken
            });
        } catch (error: any) {
            return ResponseHandler.sendResponse(res, 400, false, error?.message || "Refresh token failed", null);

        }
    }
}


export default AuthController;