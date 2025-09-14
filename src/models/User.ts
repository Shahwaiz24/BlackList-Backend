import { Brand } from "./Brand";
import { Refferals } from "./Refferals";

export interface RequestUser {
    email: string;
    password: string;
    confirmpassword: string;
    firstname: string;
    lastname: string;
    ssn: string;
    refferalcode?: string;
    billingdata: string;
}

export interface User {
    userId: string;
    email: string;
    verified: boolean;
    role: "user" | "admin";
    password: string;
    firstname: string;
    lastname: string;
    createdAt: string;
    brand: Brand;
    refferals: Refferals;
    billingdata: UserBillingData;
}

export interface InsertedUser {
    userId: string;
    email: string;
    verified: boolean;
    role: "user" | "admin";
    password: string;
    firstname: string;
    lastname: string;
    createdAt: string;
    brandid: string;
    refferalsid: string;
    billingdata: UserBillingData;
}

export interface UserBillingData {
    accountname: string;
    accountnumber: string;
    expirydate: string;
    cvv: string;
}



