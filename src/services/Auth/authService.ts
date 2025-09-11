import { InsertedUser, RequestUser } from "../../models/User";
import { decryptData, decryptToken } from "securex"
class AuthService {
    static async registerUser(body: RequestUser) {
        try {
            const { email, password, confirmpassword, firstname, lastname, ssn, billingdata, refferalcode } = body;
            const isSSNValid = await decryptToken(ssn, process.env.SECUREX_KEY as string) ? true : false;
            const isBillingDataValid = await decryptData(billingdata, process.env.SECUREX_KEY as string) ? true : false;
            if (!isSSNValid) {
                throw new Error("Invalid SSN Token");
            }
            if (!isBillingDataValid) {
                throw new Error("Invalid Billing Data");
            }
            if (password !== confirmpassword) {
                throw new Error("Password and Confirm Password do not match");
            }
            const user: InsertedUser = {
                id: "",
                email: "",
                verified: false,
                firstname: "",
                lastname: "",
                createdAt: "",
                brandid: "",
                refferalsid: ""
            }
        } catch (error) {

            throw new Error(error as string);
        }
        // const user = await User.create({ email, password, firstname, lastname, ssn, billingdata, refferalcode });
        // return user;


    }

}

export default AuthService;