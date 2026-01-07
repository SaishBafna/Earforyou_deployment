// utils/razorpay.js
import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

export const createRazorpayOrder = async (amount, currency = 'INR', receipt, notes = {}) => {
    try {
        // Validate amount is a number and positive
        const amountInPaise = Math.round(Number(amount) * 100);
        if (isNaN(amountInPaise)) {
            throw new Error('Amount must be a valid number');
        }
        if (amountInPaise < 100) {
            throw new Error('Amount must be at least 1 INR');
        }

        // Validate receipt length
        if (receipt.length > 40) {
            receipt = receipt.substring(0, 40);
        }

        const options = {
            amount: amountInPaise,
            currency,
            receipt,
            notes,
            payment_capture: 1
        };

        const order = await razorpay.orders.create(options);
        return order;
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        throw error;
    }
};

export const verifyRazorpayPayment = async (orderId, paymentId, signature) => {
    try {
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');

        if (generatedSignature !== signature) {
            throw new Error('Payment signature verification failed');
        }

        const payment = await razorpay.payments.fetch(paymentId);
        return {
            verified: true,
            payment
        };
    } catch (error) {
        console.error('Error verifying Razorpay payment:', error);
        throw error;
    }
};

export default razorpay;