import AuthRouter from "./authRoutes.js";
import express from "express";
const mainRouter = express.Router();

mainRouter.use("/auth", AuthRouter);


export default mainRouter;