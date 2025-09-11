import { Product } from "./Product";
export interface RequestBrand {
    name: string;
    yearfounded?: string;
    description?: string;
    logo: string;
    distributionstates: string[]
}

export interface Brand {
    brandid: string;
    name: string;
    yearfounded?: string;
    description?: string;
    logourl: string;
    distributionstates: string[]
    products: Product[]
}