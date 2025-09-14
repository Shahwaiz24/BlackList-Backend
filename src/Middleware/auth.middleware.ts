import { NextFunction, Request, Response } from "express";
import ResponseHandler from "../helpers/ResponseHandler.js";
import { verify } from "securex";

class AuthMiddleware {
    static async verifyAccessToken(req: Request, res: Response, next: NextFunction) {
        try {
            const token = req.headers.authorization?.split(" ")[1];
            if (!token) {
                return ResponseHandler.sendResponse(res, 401, false, "Access token is required", null);
            }
            const decoded = await verify(token, process.env.SECUREX_KEY as string);
            if (!decoded) {
                return ResponseHandler.sendResponse(res, 401, false, "Invalid access token", null);
            }
            if (decoded.type !== "access") {
                return ResponseHandler.sendResponse(res, 401, false, "Invalid access token", null);
            }
            (req as any).user = {
                id: decoded.userId,
                email: decoded.email,
                role: decoded.role
            };
            next();
        } catch (error: any) {
            const message = error?.message ?? "Unauthorized user";
            return ResponseHandler.sendResponse(res, 401, false, message, null);
        }
    }

    static async isAdmin(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (user.role !== "admin") {
                return ResponseHandler.sendResponse(res, 403, false, "Only Admin can access this resource", null);
            }
            next();
        } catch (error: any) {
            const message = error?.message ?? "Unauthorized user";
            return ResponseHandler.sendResponse(res, 401, false, message, null);
        }
    }


}

export default AuthMiddleware;