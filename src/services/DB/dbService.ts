import DatabaseConfig from "../../config/db.js";
import { ObjectId } from "mongodb";

class DBService {
    // Generic insert
    static async insertData(collectionName: string, data: any) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.insertOne(data);
            return result;
        } catch (error) {
            throw new Error(`Insert failed: ${error}`);
        }
    }

    // Generic find by ID
    static async findById(collectionName: string, id: string) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.findOne({ _id: new ObjectId(id) });
            return result;
        } catch (error) {
            throw new Error(`Find by ID failed: ${error}`);
        }
    }

    // Generic find by field
    static async findByField(collectionName: string, field: string, value: any) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.findOne({ [field]: value });
            return result;
        } catch (error) {
            throw new Error(`Find by field failed: ${error}`);
        }
    }

    // Generic find all with limit
    static async findAll(collectionName: string, limit: number = 100) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.find({}).limit(limit).toArray();
            return result;
        } catch (error) {
            throw new Error(`Find all failed: ${error}`);
        }
    }

    // Generic update by ID
    static async updateById(collectionName: string, id: string, updateData: any) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updateData }
            );
            return result;
        } catch (error) {
            throw new Error(`Update failed: ${error}`);
        }
    }

    // Generic update by field
    static async updateByField(collectionName: string, fieldName: string, fieldValue: any, updateData: any) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.updateOne(
                { [fieldName]: fieldValue },
                { $set: updateData }
            );
            return result;
        } catch (error) {
            throw new Error(`Update by field failed: ${error}`);
        }
    }

    // Generic delete by ID
    static async deleteById(collectionName: string, id: string) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.deleteOne({ _id: new ObjectId(id) });
            return result;
        } catch (error) {
            throw new Error(`Delete failed: ${error}`);
        }
    }

    // Bulk insert
    static async bulkInsert(collectionName: string, dataArray: any[]) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.insertMany(dataArray, { ordered: false });
            return result;
        } catch (error) {
            throw new Error(`Bulk insert failed: ${error}`);
        }
    }

    // Count documents
    static async count(collectionName: string, filter: any = {}) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.countDocuments(filter);
            return result;
        } catch (error) {
            throw new Error(`Count failed: ${error}`);
        }
    }

    // Relationship methods for proper data population

    // Find brand with populated products
    static async findBrandWithProducts(brandId: string) {
        try {
            // First get the brand
            const brand = await this.findByField('brands', 'brandid', brandId);
            if (!brand) {
                return null;
            }

            // If brand has products document ID, fetch products
            if (brand.productsdocid) {
                const productsDoc = await this.findByField('products', 'productdocid', brand.productsdocid);
                if (productsDoc && productsDoc.productList) {
                    // Return brand with populated products
                    return {
                        brandid: brand.brandid,
                        name: brand.name,
                        yearfounded: brand.yearfounded,
                        description: brand.description,
                        logourl: brand.logourl,
                        distributionstates: brand.distributionstates,
                        products: productsDoc.productList
                    };
                }
            }

            // Return brand without products if no products doc
            return {
                brandid: brand.brandid,
                name: brand.name,
                yearfounded: brand.yearfounded,
                description: brand.description,
                logourl: brand.logourl,
                distributionstates: brand.distributionstates,
                products: []
            };
        } catch (error) {
            throw new Error(`Find brand with products failed: ${error}`);
        }
    }

    // Find product by searching in product documents
    static async findProductById(productId: string) {
        try {
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection('products');

            const productsDoc = await collection.findOne({
                "productList.productId": productId
            });

            if (productsDoc && productsDoc.productList) {
                return productsDoc.productList.find((p: any) => p.productId === productId);
            }
            return null;
        } catch (error) {
            throw new Error(`Find product by ID failed: ${error}`);
        }
    }

    // Get paginated data with proper limit and skip
    static async findPaginated(collectionName: string, page: number = 1, limit: number = 10) {
        try {
            if (page < 1 || limit < 1 || limit > 100) {
                throw new Error('Invalid pagination parameters: page must be >= 1, limit must be 1-100');
            }

            const skip = (page - 1) * limit;
            const database = await DatabaseConfig.getDatabase();
            const collection = database.collection(collectionName);
            const result = await collection.find({}).skip(skip).limit(limit).toArray();
            return result;
        } catch (error) {
            throw new Error(`Paginated find failed: ${error}`);
        }
    }
}

export default DBService;