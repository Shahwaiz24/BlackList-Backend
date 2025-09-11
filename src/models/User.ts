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
    id: string;
    email: string;
    verified: boolean;
    firstname: string;
    lastname: string;
    createdAt: string;
    brand: Brand;
    refferals: Refferals
}

export interface InsertedUser {
    id: string;
    email: string;
    verified: boolean;
    firstname: string;
    lastname: string;
    createdAt: string;
    brandid: string;
    refferalsid: string;
}

