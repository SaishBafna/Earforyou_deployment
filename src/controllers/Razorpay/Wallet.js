import User from '../../models/Users.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Wallet from '../../models/Wallet/Wallet.js';
import SubscriptionPlan from '../../models/Subscription/Subscription.js';
import { Coupon, CouponUsage } from '../../models/CouponSystem/couponModel.js';

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
     * Creates a Razorpay order for subscription purchase with coupon support
     */
    async createOrder(userId, planId, couponCode = null) {
        try {
            if (!userId || !planId) {
                throw new Error("User ID and Plan ID are required");
            }

            const plan = await SubscriptionPlan.findById(planId);
            if (!plan) throw new Error("Invalid or inactive plan");
            if (plan.price <= 0) throw new Error("Invalid plan price");

            // Initialize coupon variables
            let coupon = null;
            let finalAmount = plan.price;
            let couponDetails = null;
            let bonusTalkTime = 0;

            // Process coupon if provided
            if (couponCode) {
                coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

                if (coupon) {
                    try {
                        console.log("Processing coupon code:", couponCode);

                        // Validate coupon
                        if (!coupon.isUsable) {
                            throw new Error("Coupon is not usable (expired, inactive, or max uses reached)");
                        }

                        // Check if user has already used this coupon
                        if (!coupon.isReusable) {
                            const existingUsage = await CouponUsage.findOne({
                                coupon: coupon._id,
                                user: userId
                            });

                            if (existingUsage) {
                                throw new Error("You have already used this coupon");
                            }
                        }

                        // Check minimum order amount if applicable
                        if (coupon.minimumOrderAmount && plan.price < coupon.minimumOrderAmount) {
                            throw new Error(`Minimum order amount of ₹${coupon.minimumOrderAmount} required for this coupon`);
                        }

                        // Apply coupon discount based on type
                        if (coupon.discountType === 'percentage') {
                            const discountAmount = (plan.price * coupon.discountValue) / 100;
                            finalAmount = plan.price - discountAmount;
                            console.log(`Applied ${coupon.discountValue}% coupon, discount: ₹${discountAmount}`);
                        } else if (coupon.discountType === 'fixed') {
                            finalAmount = plan.price - coupon.discountValue;
                            if (finalAmount < 0) finalAmount = 0;
                            console.log(`Applied fixed coupon worth ₹${coupon.discountValue}`);
                        } else if (coupon.discountType === 'free_days') {
                            // For free days, we don't modify the price but will add extra talk time later
                            console.log(`Will add ${coupon.discountValue} free days`);
                        }

                        couponDetails = {
                            code: coupon.code,
                            discountType: coupon.discountType,
                            discountValue: coupon.discountValue
                        };

                    } catch (couponError) {
                        console.log("Coupon processing error:", couponError.message);
                        // Continue without coupon
                        coupon = null;
                        finalAmount = plan.price;
                    }
                }
            }

            // Generate a shorter receipt ID (max 40 chars)
            const receiptId = `sub_${userId.toString().slice(-12)}_${Date.now().toString().slice(-6)}`;

            const order = await instance.orders.create({
                amount: Math.round(finalAmount * 100), // Convert to paise
                currency: "INR",
                receipt: receiptId,
                notes: {
                    userId: userId.toString(),
                    planId: planId.toString(),
                    couponCode: couponCode || '',
                    originalAmount: plan.price,
                    discountAmount: plan.price - finalAmount
                }
            });

            if (!order || !order.id) {
                throw new Error("Failed to create order with Razorpay");
            }

            return {
                id: order.id,
                amount: order.amount / 100, // Convert back to rupees
                originalAmount: plan.price,
                currency: order.currency,
                key: process.env.RAZORPAY_KEY_ID,
                plan: {
                    name: plan.name,
                    talkTime: plan.talkTime,
                    validity: plan.validityDays
                },
                coupon: couponDetails
            };
        } catch (error) {
            console.error('Error in createOrder:', error);
            throw new Error(`Order creation failed: ${error.message}`);
        }
    },

    /**
     * Verifies payment and activates subscription with coupon handling
     */
    async verifyAndActivate(userId, planId, paymentData, couponCode = null) {
        try {
            if (!paymentData || !paymentData.razorpay_order_id || !paymentData.razorpay_payment_id || !paymentData.razorpay_signature) {
                throw new Error("Invalid payment data provided");
            }

            this.validatePayment(paymentData);

            const plan = await SubscriptionPlan.findById(planId);
            if (!plan) throw new Error("Plan not found");

            // Fetch the order to get original details
            const order = await instance.orders.fetch(paymentData.razorpay_order_id);
            const originalAmount = order.notes?.originalAmount || plan.price;
            const discountAmount = order.notes?.discountAmount || 0;
            const finalAmount = originalAmount - discountAmount;

            let paymentDetails;
            try {
                paymentDetails = await this.processPayment(paymentData, finalAmount);
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
                            amount: finalAmount,
                            originalAmount: originalAmount,
                            discountAmount: discountAmount,
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

            // Process coupon if it exists
            let coupon = null;
            let bonusTalkTime = 0;
            let finalTalkTime = plan.talkTime;

            if (couponCode) {
                coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

                if (coupon) {
                    try {
                        // Apply coupon benefits for talk time
                        if (coupon.discountType === 'percentage') {
                            bonusTalkTime = Math.floor(plan.talkTime * (coupon.discountValue / 100));
                            finalTalkTime = plan.talkTime + bonusTalkTime;
                        } else if (coupon.discountType === 'fixed') {
                            // For fixed amount coupons, convert the discount to equivalent talk time
                            const talkTimePerRupee = plan.talkTime / originalAmount;
                            bonusTalkTime = Math.floor(coupon.discountValue * talkTimePerRupee);
                            finalTalkTime = plan.talkTime + bonusTalkTime;
                        } else if (coupon.discountType === 'free_days') {
                            // For free days, we'll add extra days' worth of talk time
                            const dailyTalkTime = plan.talkTime / 30; // Assuming 30-day plan
                            bonusTalkTime = Math.floor(coupon.discountValue * dailyTalkTime);
                            finalTalkTime = plan.talkTime + bonusTalkTime;
                        }

                        // Record coupon usage
                        await CouponUsage.create({
                            coupon: coupon._id,
                            user: userId,
                            discountApplied: bonusTalkTime,
                            transactionId: paymentData.razorpay_order_id,
                            planId: planId,
                            appliedAt: new Date()
                        });

                        // Update coupon usage count
                        coupon.currentUses += 1;
                        await coupon.save();

                    } catch (couponError) {
                        console.log("Coupon processing error:", couponError.message);
                        // Continue without coupon benefits
                        bonusTalkTime = 0;
                        finalTalkTime = plan.talkTime;
                    }
                }
            }

            // Create subscription with updated talk time
            const subscription = await this.createSubscription(
                userId,
                planId,
                paymentDetails,
                finalTalkTime,
                bonusTalkTime,
                coupon ? coupon.code : null
            );

            return subscription;
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
            this.verifyWebhookSignature(req);

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
            // Step 1: Fetch the payment details from Razorpay
            const fetchedPayment = await instance.payments.fetch(paymentData.razorpay_payment_id);

            if (!fetchedPayment) {
                throw new Error('Payment not found');
            }

            // Step 2: Check if payment is already captured
            if (fetchedPayment.status === 'captured') {
                return {
                    status: "success",
                    transactionId: paymentData.razorpay_order_id,
                    paymentId: fetchedPayment.id,
                    signature: paymentData.razorpay_signature,
                    amount,
                    gatewayResponse: fetchedPayment,
                    completedAt: new Date()
                };
            }

            // Step 3: Capture the payment if not already captured
            const capturedPayment = await instance.payments.capture(
                paymentData.razorpay_payment_id,
                Math.round(amount * 100), // Convert to paise
                "INR"
            );

            if (!capturedPayment || capturedPayment.error) {
                throw new Error(capturedPayment?.error?.description || "Payment capture failed");
            }

            // Step 4: Return success response
            return {
                status: "success",
                transactionId: paymentData.razorpay_order_id,
                paymentId: capturedPayment.id,
                signature: paymentData.razorpay_signature,
                amount,
                gatewayResponse: capturedPayment,
                completedAt: new Date()
            };

        } catch (error) {
            // Step 5: Handle and log error
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
     * Creates subscription record with coupon support and updates wallet
     */
    async createSubscription(userId, planId, paymentDetails, finalTalkTime, bonusTalkTime = 0, couponCode = null) {
        try {
            const plan = await SubscriptionPlan.findById(planId);
            if (!plan) {
                throw new Error("Plan not found");
            }

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + plan.validityDays);

            const subscriptionData = {
                user: userId,
                plan: planId,
                expiryDate,
                talkTime: finalTalkTime,
                isActive: paymentDetails.status === "success",
                payment: {
                    gateway: "RazorPay",
                    currency: "INR",
                    ...paymentDetails
                },
                couponDetails: couponCode ? {
                    code: couponCode,
                    bonusTalkTime: bonusTalkTime
                } : undefined
            };

            // Find or create wallet
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = await Wallet.create({
                    userId,
                    balance: 0,
                    talkTime: 0,
                    currency: 'inr',
                    recharges: [],
                    deductions: [],
                    plan: [],
                    lastUpdated: new Date()
                });
            }

            // Add talk time to wallet only if payment was successful
            if (paymentDetails.status === "success") {
                wallet.talkTime += finalTalkTime;

                // Add the plan to the user's wallet
                wallet.plan.push({
                    planId,
                    name: plan.name,
                    talkTime: finalTalkTime,
                    validityDays: plan.validityDays,
                    expiryDate: expiryDate,
                    status: 'active'
                });

                // Add payment record
                wallet.recharges.push({
                    amount: paymentDetails.amount,
                    payment: {
                        gateway: "RazorPay",
                        transactionId: paymentDetails.transactionId,
                        paymentId: paymentDetails.paymentId,
                        amount: paymentDetails.amount,
                        currency: "INR",
                        status: "success",
                        gatewayResponse: paymentDetails.gatewayResponse,
                        completedAt: new Date()
                    },
                    rechargeDate: new Date(),
                    planId: planId,
                    couponCode: couponCode || undefined
                });

                await wallet.save();
            }

            return {
                subscription: subscriptionData,
                wallet: {
                    balance: wallet.balance,
                    talkTime: wallet.talkTime
                },
                couponApplied: couponCode ? {
                    code: couponCode,
                    bonusTalkTime: bonusTalkTime
                } : null
            };
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

            // Fetch order details
            const order = await instance.orders.fetch(payment.order_id);
            if (!order.notes || !order.notes.userId || !order.notes.planId) {
                throw new Error("Missing user or plan information in order notes");
            }

            const userId = order.notes.userId;
            const planId = order.notes.planId;
            const couponCode = order.notes.couponCode || null;
            const originalAmount = order.notes.originalAmount || payment.amount / 100;
            const discountAmount = order.notes.discountAmount || 0;
            const finalAmount = originalAmount - discountAmount;

            const plan = await SubscriptionPlan.findById(planId);
            if (!plan) {
                throw new Error("Plan not found");
            }

            // Process coupon if it exists
            let coupon = null;
            let bonusTalkTime = 0;
            let finalTalkTime = plan.talkTime;

            if (couponCode) {
                coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

                if (coupon) {
                    try {
                        // Apply coupon benefits for talk time
                        if (coupon.discountType === 'percentage') {
                            bonusTalkTime = Math.floor(plan.talkTime * (coupon.discountValue / 100));
                            finalTalkTime = plan.talkTime + bonusTalkTime;
                        } else if (coupon.discountType === 'fixed') {
                            const talkTimePerRupee = plan.talkTime / originalAmount;
                            bonusTalkTime = Math.floor(coupon.discountValue * talkTimePerRupee);
                            finalTalkTime = plan.talkTime + bonusTalkTime;
                        } else if (coupon.discountType === 'free_days') {
                            const dailyTalkTime = plan.talkTime / 30;
                            bonusTalkTime = Math.floor(coupon.discountValue * dailyTalkTime);
                            finalTalkTime = plan.talkTime + bonusTalkTime;
                        }

                        // Record coupon usage
                        await CouponUsage.create({
                            coupon: coupon._id,
                            user: userId,
                            discountApplied: bonusTalkTime,
                            transactionId: payment.order_id,
                            planId: planId,
                            appliedAt: new Date()
                        });

                        // Update coupon usage count
                        coupon.currentUses += 1;
                        await coupon.save();

                    } catch (couponError) {
                        console.log("Coupon processing error in webhook:", couponError.message);
                        bonusTalkTime = 0;
                        finalTalkTime = plan.talkTime;
                    }
                }
            }

            // Create subscription with updated talk time
            const paymentDetails = {
                status: "success",
                transactionId: payment.order_id,
                paymentId: payment.id,
                amount: finalAmount,
                originalAmount: originalAmount,
                discountAmount: discountAmount,
                gatewayResponse: payment,
                completedAt: new Date()
            };

            return await this.createSubscription(
                userId,
                planId,
                paymentDetails,
                finalTalkTime,
                bonusTalkTime,
                couponCode
            );
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

            // Fetch order to get user ID for notification
            const order = await instance.orders.fetch(payment.order_id);
            const userId = order.notes?.userId;

            // Record failed payment in wallet if user exists
            if (userId) {
                let wallet = await Wallet.findOne({ userId });
                if (!wallet) {
                    wallet = await Wallet.create({
                        userId,
                        balance: 0,
                        talkTime: 0,
                        currency: 'inr',
                        recharges: [],
                        deductions: [],
                        plan: [],
                        lastUpdated: new Date()
                    });
                }

                wallet.recharges.push({
                    amount: payment.amount ? payment.amount / 100 : 0,
                    payment: {
                        gateway: "RazorPay",
                        transactionId: payment.order_id,
                        paymentId: payment.id,
                        amount: payment.amount ? payment.amount / 100 : 0,
                        currency: "INR",
                        status: "failed",
                        gatewayResponse: payment,
                        completedAt: new Date()
                    },
                    rechargeDate: new Date()
                });

                await wallet.save();
            }

            // Send notification if user exists
            if (userId) {
                await sendNotification(
                    userId,
                    "Payment Failed",
                    `Your payment of ₹${payment.amount ? payment.amount / 100 : 'unknown'} failed. ` +
                    `Transaction ID: ${payment.order_id}.`,
                    "Wallet_detail"
                );
            }
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
            if (!order.notes || !order.notes.userId) {
                throw new Error("Missing user information in order notes");
            }

            const userId = order.notes.userId;

            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = await Wallet.create({
                    userId,
                    balance: 0,
                    talkTime: 0,
                    currency: 'inr',
                    recharges: [],
                    deductions: [],
                    plan: [],
                    lastUpdated: new Date()
                });
            }

            wallet.recharges.push({
                amount: amount,
                payment: {
                    gateway: "RazorPay",
                    transactionId: orderId,
                    paymentId: paymentId,
                    amount: amount,
                    currency: "INR",
                    status: "failed",
                    gatewayResponse: { error },
                    completedAt: new Date()
                },
                rechargeDate: new Date()
            });

            await wallet.save();

            // Send notification about failed payment
            await sendNotification(
                userId,
                "Payment Processing Failed",
                `There was an error processing your payment. ` +
                `Transaction ID: ${orderId}. ` +
                `Please contact support.`
            );
        } catch (error) {
            console.error('Failed to record failed payment:', error);
            throw error;
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