import { ChatUserPremium } from "../../models/Subscriptionchat/ChatUserPremium.js";
import ChatPremium from "../../models/Subscriptionchat/ChatPremium.js";
import Razorpay from 'razorpay';
import crypto from 'crypto';

// Initialize Razorpay instance with error handling
let instance;
try {
    instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
} catch (error) {
    console.error('Razorpay initialization failed:', error);
    throw new Error('Payment gateway initialization failed');
}

export const paymentService = {
    /**
     * Creates a Razorpay order for subscription purchase
     */
    async createOrder(userId, planId) {
        try {
            if (!userId || !planId) {
                throw new Error("User ID and Plan ID are required");
            }

            const plan = await ChatPremium.findById(planId);
            if (!plan) throw new Error("Invalid or inactive plan");
            if (plan.price <= 0) throw new Error("Invalid plan price");

            // Generate a shorter receipt ID (max 40 chars)
            const receiptId = `sub_${userId.toString().slice(-12)}_${Date.now().toString().slice(-6)}`;

            const order = await instance.orders.create({
                amount: Math.round(plan.price * 100), // Convert to paise
                currency: "INR",
                receipt: receiptId,
                notes: {
                    userId: userId.toString(),
                    planId: planId.toString()
                }
            });

            if (!order || !order.id) {
                throw new Error("Failed to create order with Razorpay");
            }

            return {
                id: order.id,
                amount: order.amount / 100, // Convert back to rupees
                currency: order.currency,
                key: process.env.RAZORPAY_KEY_ID,
                plan: {
                    name: plan.name,
                    chats: plan.chatsAllowed,
                    validity: plan.validityDays
                }
            };
        } catch (error) {
            console.error('Error in createOrder:', error);
            throw new Error(`Order creation failed: ${error.message}`);
        }
    },

    /**
     * Verifies payment and activates subscription
     */
    async verifyAndActivate(userId, planId, paymentData) {
        try {
            if (!paymentData || !paymentData.razorpay_order_id || !paymentData.razorpay_payment_id || !paymentData.razorpay_signature) {
                throw new Error("Invalid payment data provided");
            }

            this.validatePayment(paymentData);

            const plan = await ChatPremium.findById(planId);
            if (!plan) throw new Error("Plan not found");

            let paymentDetails;
            try {
                paymentDetails = await this.processPayment(paymentData, plan.price);
            } catch (error) {
                if (error.message.includes('already been captured')) {
                    // If payment was already captured, verify and create subscription
                    const payment = await instance.payments.fetch(paymentData.razorpay_payment_id);
                    if (payment.status === 'captured') {
                        paymentDetails = {
                            status: "success",
                            transactionId: paymentData.razorpay_order_id,
                            paymentId: paymentData.razorpay_payment_id,
                            signature: paymentData.razorpay_signature,
                            amount: plan.price,
                            gatewayResponse: payment,
                            completedAt: new Date()
                        };
                    } else {
                        throw error;
                    }
                } else {
                    throw error;
                }
            }

            return await this.createSubscription(userId, planId, paymentDetails);
        } catch (error) {
            console.error('Error in verifyAndActivate:', error);
            throw error;
        }
    },

    /**
     * Handles Razorpay webhook events
     */
    async handleWebhook(req) {
        try {
            const { event, payload } = req.body;
            if (!event || !payload) {
                throw new Error("Invalid webhook payload");
            }

            const handlers = {
                'payment.captured': this.handlePaymentSuccess,
                'payment.failed': this.handlePaymentFailure,
                'subscription.charged': this.handlePaymentSuccess,
                'order.paid': this.handlePaymentSuccess
            };

            if (handlers[event]) {
                await handlers[event].call(this, payload.payment?.entity || payload.subscription?.entity);
            } else {
                console.log(`Unhandled webhook event: ${event}`);
            }
        } catch (error) {
            console.error('Webhook processing error:', error);
            throw error;
        }
    },

    // ===== PRIVATE METHODS ===== //

    /**
     * Validates payment signature
     */
    validatePayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
        try {
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex');

            if (expectedSignature !== razorpay_signature) {
                throw new Error("Payment verification failed: Invalid signature");
            }
        } catch (error) {
            console.error('Payment validation error:', error);
            throw new Error("Payment validation failed");
        }
    },

    /**
     * Processes payment capture
     */
    async processPayment(paymentData, amount) {
        try {
            const payment = await instance.payments.capture(
                paymentData.razorpay_payment_id,
                Math.round(amount * 100), // Convert to paise
                "INR"
            );

            if (!payment || payment.error) {
                throw new Error(payment?.error?.description || "Payment capture failed");
            }

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
            console.error('Payment processing error:', error);
            await this.recordFailedPayment(
                paymentData.razorpay_order_id,
                paymentData.razorpay_payment_id,
                amount,
                error.message
            );
            throw new Error(`Payment processing failed: ${error.message}`);
        }
    },

    /**
     * Creates subscription record
     */
    async createSubscription(userId, planId, paymentDetails) {
        try {
            const plan = await ChatPremium.findById(planId);
            if (!plan) {
                throw new Error("Plan not found");
            }

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + plan.validityDays);

            const subscriptionData = {
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
            };

            const subscription = await ChatUserPremium.create(subscriptionData);

            if (!subscription) {
                throw new Error("Failed to create subscription record");
            }

            return subscription;
        } catch (error) {
            console.error('Subscription creation error:', error);
            throw new Error(`Failed to create subscription: ${error.message}`);
        }
    },

    /**
     * Handles successful payment from webhook
     */
    async handlePaymentSuccess(payment) {
        try {
            if (!payment || !payment.order_id) {
                throw new Error("Invalid payment data in webhook");
            }

            // Check if subscription already exists
            const existingSub = await ChatUserPremium.findOne({
                "payment.transactionId": payment.order_id
            });

            if (existingSub) {
                // Update existing subscription
                return await ChatUserPremium.findOneAndUpdate(
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
            }

            // Create new subscription if not exists
            const order = await instance.orders.fetch(payment.order_id);
            if (!order.notes || !order.notes.userId || !order.notes.planId) {
                throw new Error("Missing user or plan information in order notes");
            }

            const plan = await ChatPremium.findById(order.notes.planId);
            if (!plan) {
                throw new Error("Plan not found");
            }

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + plan.validityDays);

            return await ChatUserPremium.create({
                user: order.notes.userId,
                plan: order.notes.planId,
                expiryDate,
                remainingChats: plan.chatsAllowed,
                isActive: true,
                payment: {
                    gateway: "RazorPay",
                    transactionId: payment.order_id,
                    paymentId: payment.id,
                    amount: payment.amount / 100,
                    currency: payment.currency,
                    status: "success",
                    gatewayResponse: payment,
                    completedAt: new Date()
                }
            });
        } catch (error) {
            console.error('Error in handlePaymentSuccess:', error);
            throw error;
        }
    },

    /**
     * Handles failed payment from webhook
     */
    async handlePaymentFailure(payment) {
        try {
            if (!payment || !payment.order_id) {
                throw new Error("Invalid payment data in webhook");
            }

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
                },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('Error in handlePaymentFailure:', error);
            throw error;
        }
    },

    /**
     * Records failed payment attempt
     */
    async recordFailedPayment(orderId, paymentId, amount, error) {
        try {
            const order = await instance.orders.fetch(orderId);
            if (!order.notes || !order.notes.userId || !order.notes.planId) {
                throw new Error("Missing user or plan information in order notes");
            }

            const plan = await ChatPremium.findById(order.notes.planId);
            if (!plan) {
                throw new Error("Plan not found");
            }

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + plan.validityDays);

            await ChatUserPremium.create({
                user: order.notes.userId,
                plan: order.notes.planId,
                expiryDate,
                remainingChats: plan.chatsAllowed,
                isActive: false,
                payment: {
                    gateway: "RazorPay",
                    transactionId: orderId,
                    paymentId,
                    amount,
                    currency: "INR",
                    status: "failed",
                    gatewayResponse: { error },
                    completedAt: new Date()
                }
            });
        } catch (error) {
            console.error('Failed to record failed payment:', error);
            // Fallback to minimal record if full creation fails
            try {
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
                    }
                });
            } catch (fallbackError) {
                console.error('Fallback failed payment recording also failed:', fallbackError);
            }
        }
    },

    /**
     * Verifies webhook signature
     */
    verifyWebhookSignature(req) {
        try {
            const signature = req.headers["x-razorpay-signature"];
            if (!signature) {
                throw new Error("Missing webhook signature");
            }

            const body = req.body.toString(); // Get raw body
            if (!body) {
                throw new Error("Missing webhook body");
            }

            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
                .update(body)
                .digest('hex');

            if (signature !== expectedSignature) {
                throw new Error("Invalid webhook signature");
            }
        } catch (error) {
            console.error('Webhook verification error:', error);
            throw error;
        }
    }
};