export interface RequestProduct {
    name: string;
    description: string;
    categoryid: string;
}

export interface Product {
    productId: string;
    name: string;
    description: string;
    categoryid: string;
}

export interface InsertedProductDoc {
    productdocid: string;
    brandid: string;
    productList: Product[]
}