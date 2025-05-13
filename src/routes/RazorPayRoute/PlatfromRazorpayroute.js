import express from 'express';

import { createOrder, verifyPayment, handleWebhook } from '../../controllers/Razorpay/PlatFromRazorPay.js';
import { protect } from '../../middlewares/auth/authMiddleware.js';
const router = express.Router();

// Create Razorpay order
router.post('/platfrom/create-order', protect, createOrder);

// Verify Razorpay payment (client-side confirmation)
router.post('/platfrom/verify', protect, verifyPayment);

// Razorpay webhook endpoint
router.post('/platfrom/webhook', protect, express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}), handleWebhook);

export default router;