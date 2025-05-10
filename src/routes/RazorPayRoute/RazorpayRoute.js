import express from 'express';
import { paymentService } from '../../controllers/Razorpay/Razorpay';
import protect from '../../middlewares/auth/authMiddleware.js'
const router = express.Router();

/**
 * @swagger
 * /payments/create-order:
 *   post:
 *     summary: Create Razorpay order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planId:
 *                 type: string
 *                 example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RazorpayOrder'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/create-order', protect, async (req, res) => {
    try {
        const { planId } = req.body;

        if (!planId) {
            return res.status(400).json({ error: "Plan ID is required" });
        }

        const order = await paymentService.createOrder(req.user._id, planId);
        res.status(201).json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(400).json({
            success: false,
            error: error.message || "Failed to create order"
        });
    }
});

/**
 * @swagger
 * /payments/verify:
 *   post:
 *     summary: Verify and activate subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planId:
 *                 type: string
 *                 example: "507f1f77bcf86cd799439011"
 *               payment:
 *                 type: object
 *                 properties:
 *                   razorpay_payment_id:
 *                     type: string
 *                   razorpay_order_id:
 *                     type: string
 *                   razorpay_signature:
 *                     type: string
 *     responses:
 *       200:
 *         description: Subscription activated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Subscription'
 *       400:
 *         description: Payment verification failed
 *       401:
 *         description: Unauthorized
 */
router.post('/verify', protect, async (req, res) => {
    try {
        const { planId, payment } = req.body;

        if (!planId || !payment) {
            return res.status(400).json({ error: "Plan ID and payment data are required" });
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

        const statusCode = error.message.includes('verification') ? 400 : 500;

        res.status(statusCode).json({
            success: false,
            error: error.message || "Payment verification failed"
        });
    }
});

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     summary: Handle Razorpay webhook events
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook signature
 *       500:
 *         description: Internal server error
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        await paymentService.handleWebhook(req);
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook processing error:', error);

        if (error.message.includes('Invalid webhook')) {
            return res.status(400).send(error.message);
        }

        res.status(500).send('Internal server error');
    }
});

export default router;