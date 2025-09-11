class Validator {
    static validate(requiredFields: string[], data: any): { isValid: boolean; missingFields: string[] } {
        const missingFields: string[] = [];

        for (const field of requiredFields) {
            const value = data[field];
            if (value === undefined || value === null || value === '') {
                missingFields.push(field);
            }
        }

        return {
            isValid: missingFields.length === 0,
            missingFields
        };
    }
}

export default Validator;