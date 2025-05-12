// routes/payment/razorpayRoutes.js
import express from 'express';
// import {
//     createOrder,
//     verifyPayment,
//     handleWebhook
// } from '../../controllers/payment/razorpayController';

import { createOrder, verifyPayment, handleWebhook } from '../../controllers/Razorpay/PlatFromRazorPay.js';
const router = express.Router();

// Create Razorpay order
router.post('/platfrom/create-order', createOrder);

// Verify Razorpay payment (client-side confirmation)
router.post('/platfrom/verify', verifyPayment);

// Razorpay webhook endpoint
router.post('/platfrom/webhook', express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}), handleWebhook);

export default router;