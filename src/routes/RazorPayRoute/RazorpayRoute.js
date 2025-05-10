import express from 'express';
import { paymentService } from '../../controllers/Razorpay/Razorpay.js';
import { protect } from '../../middlewares/auth/authMiddleware.js';

const router = express.Router();

router.post('/create-order', protect, async (req, res) => {
    try {
        const { planId } = req.body;

        if (!planId) {
            return res.status(400).json({
                success: false,
                error: "Plan ID is required"
            });
        }

        const order = await paymentService.createOrder(req.user._id, planId);

        res.status(201).json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('Create order error:', error);

        const statusCode = error.message.includes('Invalid') ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            error: error.message || "Failed to create order",
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

router.post('/verify', protect, async (req, res) => {
    try {
        const { planId, payment } = req.body;

        if (!planId || !payment) {
            return res.status(400).json({
                success: false,
                error: "Plan ID and payment data are required"
            });
        }

        const subscription = await paymentService.verifyAndActivate(
            req.user._id,
            planId,
            payment
        );

        res.status(200).json({
            success: true,
            data: subscription
        });
    } catch (error) {
        console.error('Payment verification error:', error);

        const statusCode = error.message.includes('verification') ||
            error.message.includes('Invalid') ||
            error.message.includes('already been captured') ? 400 : 500;

        res.status(statusCode).json({
            success: false,
            error: error.message || "Payment verification failed",
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

router.post('/razorwebhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        // Verify the webhook signature first
        paymentService.verifyWebhookSignature(req);

        // Parse the raw body after verification
        const webhookBody = req.body.toString();
        req.body = JSON.parse(webhookBody);

        await paymentService.handleWebhook(req);
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook processing error:', error);

        if (error.message.includes('Invalid webhook') ||
            error.message.includes('Missing webhook') ||
            error.message.includes('signature')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

export default router;