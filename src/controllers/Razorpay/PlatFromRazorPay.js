import { createRazorpayOrder, verifyRazorpayPayment } from './utils/RazorpayUtils.js';
import PlatformCharges from '../../models/Wallet/PlatfromCharges/Platfrom.js';
import MyPlan from '../../models/Wallet/PlatfromCharges/myPlanSchema.js';
import { CouponUsage, Coupon } from '../../models/CouponSystem/couponModel.js';
import User from '../../models/Users.js';
import admin from 'firebase-admin';
import crypto from 'crypto';

export const createOrder = async (req, res) => {
    const { planId, couponCode } = req.body;
    const userId = req.user._id;

    try {
        // Validate input
        if (!userId || !planId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: userId and planId are required'
            });
        }

        // Get plan details
        const planDetails = await MyPlan.findById(planId);
        if (!planDetails) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }

        // Process coupon
        let couponDetails = null;
        let validityDays = planDetails.validityDays;
        let extendedDays = 0;

        if (couponCode) {
            const coupon = await Coupon.findOne({
                code: couponCode.toUpperCase(),
                isActive: true
            });

            if (coupon) {
                // Validate coupon
                if (!coupon.isUsable) {
                    return res.status(400).json({
                        success: false,
                        message: 'This coupon is not currently usable'
                    });
                }

                if (!coupon.isReusable) {
                    const existingUsage = await CouponUsage.findOne({
                        coupon: coupon._id,
                        user: userId
                    });
                    if (existingUsage) {
                        return res.status(400).json({
                            success: false,
                            message: 'You have already used this coupon'
                        });
                    }
                }

                if (coupon.minimumOrderAmount && planDetails.price < coupon.minimumOrderAmount) {
                    return res.status(400).json({
                        success: false,
                        message: `Minimum order amount of ₹${coupon.minimumOrderAmount} required for this coupon`
                    });
                }

                // Apply coupon benefits
                if (coupon.discountType === 'free_days') {
                    extendedDays = coupon.discountValue;
                    validityDays += extendedDays;
                }

                couponDetails = {
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountValue: coupon.discountValue,
                    extendedDays: extendedDays
                };
            }
        }

        // Create Razorpay order
        const receipt = `plan_${planId}_${Date.now()}`.substring(0, 40);
        const notes = {
            userId: userId.toString(),
            planId: planId.toString(),
            couponCode: couponCode || '',
            validityDays,
            extendedDays
        };

        const order = await createRazorpayOrder(
            planDetails.price,
            'INR',
            receipt,
            notes
        );

        // Create transaction record
        const transaction = await PlatformCharges.create({
            userId,
            planId,
            planName: planDetails.planName,
            status: 'pending',
            payment: {
                gateway: 'RazorPay',
                orderId: order.id,
                transactionId: order.id,
                amount: planDetails.price,
                currency: 'INR',
                status: 'created',
                gatewayResponse: order,
                initiatedAt: new Date()
            },
            couponDetails
        });

        return res.status(200).json({
            success: true,
            message: 'Order created successfully',
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                receipt: order.receipt,
                key: process.env.RAZORPAY_KEY_ID
            },
            transactionId: transaction._id,
            couponApplied: !!couponDetails
        });

    } catch (error) {
        console.error('Error in createOrder:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

export const verifyPayment = async (req, res) => {
    const { orderId, paymentId, signature, transactionId } = req.body;

    try {
        // Validate input
        if (!orderId || !paymentId || !signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: orderId, paymentId, and signature are required'
            });
        }

        // Verify payment with Razorpay
        const verification = await verifyRazorpayPayment(orderId, paymentId, signature);
        const payment = verification.payment;

        // Find transaction by either transactionId or orderId
        let transaction;
        if (transactionId) {
            transaction = await PlatformCharges.findById(transactionId);
        } else {
            transaction = await PlatformCharges.findOne({ 'payment.orderId': orderId });
        }

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        // Check if already processed
        if (transaction.payment.status === 'success') {
            return res.status(200).json({
                success: true,
                message: 'Payment already verified',
                transactionId: transaction._id
            });
        }

        // Update payment details
        transaction.payment = {
            ...transaction.payment,
            paymentId,
            signature,
            transactionId: payment.id,
            amount: payment.amount / 100, // Convert from paise to rupees
            currency: payment.currency,
            status: payment.status === 'captured' ? 'success' : 'failed',
            gatewayResponse: payment,
            completedAt: new Date()
        };

        // Process successful payment
        if (payment.status === 'captured') {
            const now = new Date();
            const validityDays = transaction.payment.gatewayResponse.notes?.validityDays || 30;
            let startDate = now;
            let endDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
            let status = 'active';

            // Check for existing active plans
            const activePlan = await PlatformCharges.findOne({
                userId: transaction.userId,
                status: 'active',
                endDate: { $gt: now }
            }).sort({ endDate: -1 });

            // Process coupon if used
            const couponCode = transaction.payment.gatewayResponse.notes?.couponCode;
            if (couponCode && transaction.couponDetails?.code) {
                const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
                if (coupon) {
                    // Update coupon usage count
                    coupon.currentUses += 1;
                    await coupon.save();

                    await CouponUsage.create({
                        coupon: coupon._id,
                        user: transaction.userId,
                        transaction: transaction._id,
                        discountApplied: coupon.discountType === 'free_days' ?
                            (transaction.payment.gatewayResponse.notes?.extendedDays || 0) : 0,
                        appliedAt: new Date()
                    });
                }
            }

            // Handle plan activation or queuing
            if (activePlan) {
                status = 'queued';
                startDate = new Date(activePlan.endDate);
                endDate = new Date(startDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

                await sendNotification(
                    transaction.userId,
                    'Plan Queued Successfully',
                    `Your ${validityDays}-day plan will activate on ${startDate.toLocaleDateString()}`,
                    'subscriptions'
                );
            } else {
                await sendNotification(
                    transaction.userId,
                    'Plan Activated',
                    `Your ${validityDays}-day plan is now active!`,
                    'subscriptions'
                );
            }

            transaction.startDate = startDate;
            transaction.endDate = endDate;
            transaction.status = status;
        } else {
            transaction.status = 'failed';
        }

        await transaction.save();

        return res.status(200).json({
            success: payment.status === 'captured',
            message: payment.status === 'captured'
                ? 'Payment verified successfully'
                : 'Payment verification failed',
            transactionId: transaction._id,
            status: transaction.status
        });

    } catch (error) {
        console.error('Error in verifyPayment:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

export const handleWebhook = async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const razorpaySignature = req.headers['x-razorpay-signature'];

    try {
        // Verify webhook signature
        const body = JSON.stringify(req.body);
        const generatedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(body)
            .digest('hex');

        if (generatedSignature !== razorpaySignature) {
            console.error('Webhook signature verification failed');
            return res.status(401).json({ status: 'error', message: 'Invalid signature' });
        }

        const event = req.body.event;
        const payment = req.body.payload.payment?.entity;
        const order = req.body.payload.order?.entity;

        console.log(`Processing Razorpay webhook event: ${event}`);

        // Handle only payment captured events
        if (event === 'payment.captured') {
            if (!payment || !order) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Missing payment or order data'
                });
            }

            // Find transaction by orderId
            const transaction = await PlatformCharges.findOne({
                'payment.orderId': payment.order_id
            });

            if (!transaction) {
                console.error(`Transaction not found for order: ${payment.order_id}`);
                return res.status(404).json({
                    status: 'error',
                    message: 'Transaction not found'
                });
            }

            // Skip if already processed
            if (transaction.payment.status === 'success') {
                return res.status(200).json({
                    status: 'success',
                    message: 'Already processed'
                });
            }

            // Update payment details
            transaction.payment = {
                ...transaction.payment,
                paymentId: payment.id,
                signature: razorpaySignature,
                transactionId: payment.id,
                amount: payment.amount / 100,
                currency: payment.currency,
                status: 'success',
                gatewayResponse: { payment, order },
                completedAt: new Date(payment.created_at * 1000)
            };

            // Process successful payment
            const now = new Date();
            const validityDays = order.notes?.validityDays || 30;
            let startDate = now;
            let endDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
            let status = 'active';

            // Check for existing active plans
            const activePlan = await PlatformCharges.findOne({
                userId: transaction.userId,
                status: 'active',
                endDate: { $gt: now }
            }).sort({ endDate: -1 });

            // Process coupon if used
            const couponCode = order.notes?.couponCode;
            if (couponCode && transaction.couponDetails?.code) {
                const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
                if (coupon) {
                    // Update coupon usage count
                    coupon.currentUses += 1;
                    await coupon.save();

                    await CouponUsage.create({
                        coupon: coupon._id,
                        user: transaction.userId,
                        transaction: transaction._id,
                        discountApplied: coupon.discountType === 'free_days' ?
                            (order.notes?.extendedDays || 0) : 0,
                        appliedAt: new Date()
                    });
                }
            }

            // Handle plan activation or queuing
            if (activePlan) {
                status = 'queued';
                startDate = new Date(activePlan.endDate);
                endDate = new Date(startDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

                await sendNotification(
                    transaction.userId,
                    'Plan Queued Successfully',
                    `Your ${validityDays}-day plan will activate on ${startDate.toLocaleDateString()}`,
                    'subscriptions'
                );
            } else {
                await sendNotification(
                    transaction.userId,
                    'Plan Activated',
                    `Your ${validityDays}-day plan is now active!`,
                    'subscriptions'
                );
            }

            transaction.startDate = startDate;
            transaction.endDate = endDate;
            transaction.status = status;
            await transaction.save();

            console.log(`Successfully processed webhook for payment: ${payment.id}`);
        }

        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error in handleWebhook:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Helper function for sending notifications
async function sendNotification(userId, title, message, screen) {
    try {
        const user = await User.findById(userId).select('deviceToken');
        if (!user?.deviceToken) {
            console.warn(`No device token found for user: ${userId}`);
            return;
        }

        const payload = {
            notification: {
                title,
                body: message,
            },
            data: {
                screen,
                type: 'subscription_update'
            },
            token: user.deviceToken
        };

        await admin.messaging().send(payload);
        console.log(`Notification sent to user: ${userId}`);
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}