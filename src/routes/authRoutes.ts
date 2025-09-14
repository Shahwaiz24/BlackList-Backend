import express from "express";
import AuthController from "../controllers/Auth/authController.js";
import AuthMiddleware from "../Middleware/auth.middleware.js";
const AuthRouter = express.Router();

AuthRouter.post("/register", AuthController.register);
AuthRouter.post("/login", AuthController.login);
AuthRouter.get("/verify-email", AuthController.verifyEmail);
AuthRouter.get("/forgot-password", AuthMiddleware.verifyAccessToken, AuthController.forgotPassword);
AuthRouter.post("/reset-password", AuthController.resetPassword);
AuthRouter.post("/refresh-token", AuthController.refreshToken);


export default AuthRouter;