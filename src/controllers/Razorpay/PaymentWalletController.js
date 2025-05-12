import { paymentService } from './Wallet';
export const paymentController = {
    /**
     * Create a Razorpay order
     */
    async createOrder(req, res) {
        try {
            const { planId, couponCode } = req.body;
            const userId = req.user._id;

            if (!userId || !planId) {
                return res.status(400).json({
                    success: false,
                    message: "User ID and Plan ID are required"
                });
            }

            const order = await paymentService.createOrder(userId, planId, couponCode);

            return res.status(200).json({
                success: true,
                message: "Order created successfully",
                data: order
            });
        } catch (error) {
            console.error('Error in createOrder controller:', error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create order"
            });
        }
    },

    /**
     * Verify payment and activate subscription
     */
    async verifyPayment(req, res) {
        try {
            const { userId, planId, couponCode } = req.body;
            const paymentData = req.body.paymentData;

            if (!userId || !planId || !paymentData) {
                return res.status(400).json({
                    success: false,
                    message: "User ID, Plan ID and payment data are required"
                });
            }

            const result = await paymentService.verifyAndActivate(
                userId,
                planId,
                paymentData,
                couponCode
            );

            // Send success notification
            await sendNotification(
                userId,
                "Payment Successful",
                `Your payment of ₹${result.subscription.payment.amount} was successful. ` +
                `You have been credited with ${result.subscription.talkTime} minutes of talk time` +
                (result.couponApplied ? ` (including ${result.couponApplied.bonusTalkTime} bonus minutes from coupon)` : '')
            );

            return res.status(200).json({
                success: true,
                message: "Payment verified and subscription activated",
                data: result
            });
        } catch (error) {
            console.error('Error in verifyPayment controller:', error);

            // Try to send error notification if we have userId
            if (req.body.userId) {
                try {
                    await sendNotification(
                        req.body.userId,
                        "Payment Verification Failed",
                        `There was an error verifying your payment. Please contact support.`
                    );
                } catch (notificationError) {
                    console.error('Failed to send error notification:', notificationError);
                }
            }

            return res.status(500).json({
                success: false,
                message: error.message || "Failed to verify payment"
            });
        }
    },

    /**
     * Handle Razorpay webhook
     */
    async handleWebhook(req, res) {
        try {
            await paymentService.handleWebhook(req);
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Error in handleWebhook controller:', error);
            return res.status(500).json({
                success: false,
                message: error.message || "Webhook processing failed"
            });
        }
    }
};