import { Response } from "express";
class ResponseHandler {
    static sendResponse(response: Response, statusCode: number, success: boolean, message: string, data: any) {
        response.status(statusCode).send({
            success,
            message,
            data

        });
        return;
    }
}

export default ResponseHandler;