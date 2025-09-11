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
}

export default DBService;