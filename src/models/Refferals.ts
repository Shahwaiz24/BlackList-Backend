import { User } from "./User";

export interface Refferals {
    userrefferalcode: string;
    refferalusers: {
        userid: string;
        userfirstname: string;
        userlastname: string;
        usercreatedat: string;
    }[]
}