import express from 'express';
import { paymentService } from '../../controllers/Razorpay/Wallet.js';
import { protect } from '../../middlewares/auth/authMiddleware.js';
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment processing and management
 */

/**
 * @swagger
 * /payments/create-order:
 *   post:
 *     summary: Create a Razorpay order for subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *                 description: ID of the subscription plan
 *               couponCode:
 *                 type: string
 *                 description: Optional coupon code
 *     responses:
 *       200:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Razorpay order ID
 *                 amount:
 *                   type: number
 *                   description: Final amount after discounts
 *                 originalAmount:
 *                   type: number
 *                   description: Original plan amount
 *                 currency:
 *                   type: string
 *                   description: Currency code (INR)
 *                 key:
 *                   type: string
 *                   description: Razorpay key ID for client-side integration
 *                 plan:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     talkTime:
 *                       type: number
 *                     validity:
 *                       type: number
 *                 coupon:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     code:
 *                       type: string
 *                     discountType:
 *                       type: string
 *                     discountValue:
 *                       type: number
 *       400:
 *         description: Invalid request or missing parameters
 *       500:
 *         description: Internal server error
 */
router.post('/wallet/create-order', protect, async (req, res) => {
  try {
    const { planId, couponCode } = req.body;
    const userId = req.user._id; // From auth middleware

    const order = await paymentService.createOrder(userId, planId, couponCode);
    res.json(order);
  } catch (error) {
    console.error('Error in create-order:', error);
    res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to create order'
    });
  }
});

/**
 * @swagger
 * /payments/verify:
 *   post:
 *     summary: Verify payment and activate subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *               - paymentData
 *             properties:
 *               planId:
 *                 type: string
 *                 description: ID of the subscription plan
 *               paymentData:
 *                 type: object
 *                 description: Payment response from Razorpay
 *                 properties:
 *                   razorpay_order_id:
 *                     type: string
 *                   razorpay_payment_id:
 *                     type: string
 *                   razorpay_signature:
 *                     type: string
 *               couponCode:
 *                 type: string
 *                 description: Optional coupon code used
 *     responses:
 *       200:
 *         description: Payment verified and subscription activated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   type: object
 *                   description: Subscription details
 *                 wallet:
 *                   type: object
 *                   description: Updated wallet balance
 *                 couponApplied:
 *                   type: object
 *                   nullable: true
 *                   description: Coupon details if applied
 *       400:
 *         description: Invalid payment data or verification failed
 *       500:
 *         description: Internal server error
 */
router.post('/wallet/verify', protect, async (req, res) => {
  try {
    const { planId, paymentData, couponCode } = req.body;
    const userId = req.user._id;

    const result = await paymentService.verifyAndActivate(
      userId,
      planId,
      paymentData,
      couponCode
    );

    res.json(result);
  } catch (error) {
    console.error('Error in payment verification:', error);
    res.status(error.statusCode || 500).json({
      error: error.message || 'Payment verification failed'
    });
  }
});

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     summary: Handle Razorpay webhook events
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook signature or payload
 *       500:
 *         description: Internal server error
 */
router.post('/wallet/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    await paymentService.handleWebhook(req);
    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error in webhook handler:', error);
    res.status(error.statusCode || 500).json({
      error: error.message || 'Webhook processing failed'
    });
  }
});

export default router;