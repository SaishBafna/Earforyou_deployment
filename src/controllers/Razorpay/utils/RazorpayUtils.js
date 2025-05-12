// utils/razorpay.js
import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

export const createRazorpayOrder = async (amount, currency = 'INR', receipt, notes = {}) => {
    try {
        const options = {
            amount: amount * 100, // Razorpay expects amount in paise
            currency,
            receipt,
            notes,
            payment_capture: 1 // Auto-capture payment
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

        // Optionally fetch payment details from Razorpay
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




async function sendNotification(userId, title, message, screen) {
    // Assuming you have the FCM device token stored in your database
    const user = await User.findById(userId);
    const deviceToken = user.deviceToken;

    if (!deviceToken) {
        console.error("No device token found for user:", userId);
        return;
    }

    const payload = {
        notification: {
            title: title,
            body: message,
        },
        data: {
            screen: screen, // This will be used in the client app to navigate
        },
        token: deviceToken,
    };

    try {
        const response = await admin.messaging().send(payload);
        console.log("Notification sent successfully:", response);
    } catch (error) {
        console.error("Error sending notification:", error);
    }
}
export default razorpay;