import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Generate a unique transaction ID
export const generateUniqueId = () => {
    return `TXN_${Date.now()}_${uuidv4().substring(0, 8)}`;
};

// Create SHA256 hash
export const sha256 = (data) => {
    return crypto.createHash('sha256').update(data).digest('hex');
};


// Verify PhonePe webhook signature
export const verifyWebhookSignature = (payload, signature, saltKey, saltIndex) => {
    try {
        // PhonePe typically sends the data and expects you to create a hash with your salt key
        const dataToHash = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const stringToHash = `${dataToHash}${saltKey}`;
        const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const expectedSignature = `${sha256Hash}###${saltIndex}`;

        return expectedSignature === signature;
    } catch (error) {
        console.error('Error verifying webhook signature:', error);
        return false;
    }
};