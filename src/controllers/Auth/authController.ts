import { Request, Response } from "express";
import Validator from "../../helpers/Validator.js";
import ResponseHandler from "../../helpers/ResponseHandler.js";
import AuthService from "../../services/Auth/authService.js";

class AuthController {
    static async register(req: Request, res: Response) {
        let body = req.body ?? {};
        const requiredFields = ["email", "password", "confirmpassword", "firstname", "lastname", "ssn", "billingdata"];
        const { isValid, missingFields } = Validator.validate(requiredFields, body);
        if (!isValid) {
            return ResponseHandler.sendResponse(res, 400, false, "Please fill in all the required fields.", missingFields);
        }
        const { email, password, confirmpassword, firstname, lastname, ssn, billingdata, refferalcode } = body;
        const user = await AuthService.registerUser({ email, password, confirmpassword, firstname, lastname, ssn, billingdata, refferalcode });
        res.status(200).send({ message: "Register endpoint" });
        return;
    };
    static async login(req: Request, res: Response) {
        res.status(200).send({ message: "Login endpoint" });
        return;
    };
}


export default AuthController;