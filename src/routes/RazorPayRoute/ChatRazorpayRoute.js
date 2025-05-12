import express from 'express';
import { paymentService } from '../../controllers/Razorpay/ChatRazorpay.js';
import { protect } from '../../middlewares/auth/authMiddleware.js';
import { ApiError } from '../../utils/ApiError.js';
import { ApiResponse } from '../../utils/ApiResponse.js';

const router = express.Router();

// Middleware to store raw body for webhook verification
const rawBodySaver = function (req, res, buf, encoding) {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
};

// Apply the raw body middleware specifically for the webhook route
const webhookRawBodyParser = express.raw({
    type: 'application/json',
    verify: rawBodySaver
});

router.post('/create-order', protect, async (req, res) => {
    try {
        const { planId, couponCode } = req.body;

        if (!planId) {
            throw new ApiError(400, "Plan ID is required");
        }

        const order = await paymentService.createOrder(req.user._id, planId, couponCode);

        res.status(201).json(
            new ApiResponse(201, order, "Order created successfully")
        );
    } catch (error) {
        console.error('Create order error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || "Failed to create order",
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

router.post('/verify', protect, async (req, res) => {
    try {
        const { planId, payment, couponCode } = req.body;

        if (!planId || !payment) {
            throw new ApiError(400, "Plan ID and payment data are required");
        }

        const subscription = await paymentService.verifyAndActivate(
            req.user._id,
            planId,
            payment,
            couponCode
        );

        res.status(200).json(
            new ApiResponse(200, subscription, "Payment verified and subscription activated")
        );
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || "Payment verification failed",
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

router.post('/razorwebhook', webhookRawBodyParser, async (req, res) => {
    try {
        // Log request details for debugging
        console.log('Webhook headers:', req.headers);
        console.log('Webhook raw body:', req.rawBody);

        // Verify we have the raw body
        if (!req.rawBody) {
            throw new ApiError(400, "Missing or invalid webhook body");
        }

        // Verify webhook signature first
        paymentService.verifyWebhookSignature(req);

        // Parse the JSON body for processing
        try {
            req.body = JSON.parse(req.rawBody);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            throw new ApiError(400, "Invalid JSON in webhook body");
        }

        await paymentService.handleWebhook(req);
        res.status(200).json(
            new ApiResponse(200, null, "Webhook processed successfully")
        );
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || "Webhook processing failed"
        });
    }
});

export default router;