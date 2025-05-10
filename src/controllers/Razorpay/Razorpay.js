import Razorpay from "razorpay";
import crypto from "crypto";
import { ChatUserPremium } from "../../models/Subscriptionchat/ChatUserPremium.js";
import ChatPremium from "../../models/Subscriptionchat/ChatPremium.js";

export const paymentService = {
    /**
     * Creates a Razorpay order for subscription purchase
     */
    async createOrder(userId, planId) {
        const plan = await ChatPremium.findById(planId);
        if (!plan?.isActive) throw new Error("Invalid or inactive plan");

        const order = await instance.orders.create({
            amount: plan.price * 100,
            currency: "INR",
            receipt: `sub_${userId}_${Date.now()}`,
            notes: { userId, planId }
        });

        return {
            id: order.id,
            amount: order.amount / 100,
            currency: order.currency,
            key: process.env.RAZORPAY_KEY_ID,
            plan: {
                name: plan.name,
                chats: plan.chatsAllowed,
                validity: plan.validityDays
            }
        };
    },

    /**
     * Verifies payment and activates subscription
     */
    async verifyAndActivate(userId, planId, paymentData) {
        this.validatePayment(paymentData);

        const plan = await ChatPremium.findById(planId);
        if (!plan) throw new Error("Plan not found");

        const paymentDetails = await this.processPayment(paymentData, plan.price);
        return this.createSubscription(userId, planId, paymentDetails);
    },

    /**
     * Handles Razorpay webhook events
     */
    async handleWebhook(req) {
        this.verifyWebhookSignature(req);

        const { event, payload } = req.body;
        const handlers = {
            'payment.captured': this.handlePaymentSuccess,
            'payment.failed': this.handlePaymentFailure,
            'order.paid': this.handlePaymentSuccess
        };

        if (handlers[event]) {
            await handlers[event].call(this, payload.payment?.entity);
        }
    },

    // ===== PRIVATE METHODS ===== //

    /**
     * Validates payment signature
     */
    validatePayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            throw new Error("Payment verification failed: Invalid signature");
        }
    },

    /**
     * Processes payment capture
     */
    async processPayment(paymentData, amount) {
        try {
            const payment = await instance.payments.capture(
                paymentData.razorpay_payment_id,
                amount * 100,
                "INR"
            );

            return {
                status: "success",
                transactionId: paymentData.razorpay_order_id,
                paymentId: payment.id,
                signature: paymentData.razorpay_signature,
                amount,
                gatewayResponse: payment,
                completedAt: new Date()
            };
        } catch (error) {
            await this.recordFailedPayment(
                paymentData.razorpay_order_id,
                paymentData.razorpay_payment_id,
                amount,
                error.message
            );
            throw error;
        }
    },

    /**
     * Creates subscription record
     */
    async createSubscription(userId, planId, paymentDetails) {
        const plan = await ChatPremium.findById(planId);
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + plan.validityDays);

        return ChatUserPremium.create({
            user: userId,
            plan: planId,
            expiryDate,
            remainingChats: plan.chatsAllowed,
            isActive: paymentDetails.status === "success",
            payment: {
                gateway: "RazorPay",
                currency: "INR",
                ...paymentDetails
            }
        });
    },

    /**
     * Handles successful payment from webhook
     */
    async handlePaymentSuccess(payment) {
        const subscription = await ChatUserPremium.findOneAndUpdate(
            { "payment.transactionId": payment.order_id },
            {
                $set: {
                    "payment.status": "success",
                    "payment.paymentId": payment.id,
                    "payment.gatewayResponse": payment,
                    "payment.completedAt": new Date(),
                    isActive: true
                }
            },
            { new: true }
        );

        if (!subscription) {
            console.warn("Subscription not found for successful payment:", payment.order_id);
        }
    },

    /**
     * Handles failed payment from webhook
     */
    async handlePaymentFailure(payment) {
        await ChatUserPremium.findOneAndUpdate(
            { "payment.transactionId": payment.order_id },
            {
                $set: {
                    "payment.status": "failed",
                    "payment.paymentId": payment.id,
                    "payment.gatewayResponse": payment,
                    "payment.completedAt": new Date(),
                    isActive: false
                }
            }
        );
    },

    /**
     * Records failed payment attempt
     */
    async recordFailedPayment(orderId, paymentId, amount, error) {
        await ChatUserPremium.create({
            payment: {
                gateway: "RazorPay",
                transactionId: orderId,
                paymentId,
                amount,
                currency: "INR",
                status: "failed",
                gatewayResponse: { error },
                completedAt: new Date()
            },
            isActive: false
        });
    },

    /**
     * Verifies webhook signature
     */
    verifyWebhookSignature(req) {
        const signature = req.headers["x-razorpay-signature"];
        const body = JSON.stringify(req.body);

        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(body)
            .digest('hex');

        if (signature !== expectedSignature) {
            throw new Error("Invalid webhook signature");
        }
    }
};