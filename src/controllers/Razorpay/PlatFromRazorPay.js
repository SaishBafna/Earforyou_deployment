// controllers/payment/razorpayController.js
import { createRazorpayOrder, verifyRazorpayPayment } from './utils/RazorpayUtils.js';
import PlatformCharges from '../../models/Wallet/PlatfromCharges/Platfrom.js';
import MyPlan from '../../models/Wallet/PlatfromCharges/myPlanSchema.js';
import { CouponUsage, Coupon } from '../../models/CouponSystem/couponModel.js';
import User from '../../models/Users.js';
export const createOrder = async (req, res) => {
    const { planId, couponCode } = req.body;
    const userId = req.user._id;
    try {
        // Validate input parameters
        if (!userId || !planId) {
            return res.status(400).json({
                success: false,
                message: 'Missing userId or planId'
            });
        }

        // Get plan details
        const planDetails = await MyPlan.findById(planId);
        if (!planDetails) {
            return res.status(404).json({
                success: false,
                message: 'Plan details not found'
            });
        }

        // Process coupon if provided
        let coupon = null;
        let validityDays = planDetails.validityDays;
        let couponDetails = null;
        let extendedDays = 0;

        if (couponCode) {
            coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

            if (coupon) {
                try {
                    if (!coupon.isUsable) {
                        throw new Error("Coupon is not usable");
                    }

                    if (!coupon.isReusable) {
                        const existingUsage = await CouponUsage.findOne({
                            coupon: coupon._id,
                            user: userId
                        });
                        if (existingUsage) {
                            return res.status(400).json({
                                success: false,
                                message: "You have already used this coupon"
                            });
                        }
                    }

                    if (coupon.minimumOrderAmount && planDetails.amount < coupon.minimumOrderAmount) {
                        throw new Error(`Minimum order amount of ₹${coupon.minimumOrderAmount} required`);
                    }

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
                } catch (couponError) {
                    return res.status(400).json({
                        success: false,
                        message: `Coupon error: ${couponError.message}`
                    });
                }
            }
        }

        // Create Razorpay order
        const receipt = `plan_${planId}_user_${userId}_${Date.now()}`;
        const notes = {
            userId: userId.toString(),
            planId: planId.toString(),
            couponCode: couponCode || '',
            validityDays,
            extendedDays
        };

        const order = await createRazorpayOrder(
            planDetails.amount,
            'INR',
            receipt,
            notes
        );

        // Create a pending transaction record
        const transaction = await PlatformCharges.create({
            userId,
            planId,
            planName: planDetails.planName || "Platform Charges",
            status: 'pending',
            payment: {
                gateway: 'RazorPay',
                orderId: order.id,
                amount: planDetails.amount,
                currency: 'INR',
                status: 'created',
                gatewayResponse: order
            }
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
            transactionId: transaction._id
        });

    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        return res.status(500).json({
            success: false,
            message: 'Error creating payment order',
            error: error.message
        });
    }
};

export const verifyPayment = async (req, res) => {
    const { orderId, paymentId, signature, transactionId } = req.body;

    try {
        // Validate input parameters
        if (!orderId || !paymentId || !signature || !transactionId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters'
            });
        }

        // Verify payment with Razorpay
        const verification = await verifyRazorpayPayment(orderId, paymentId, signature);
        const payment = verification.payment;

        // Get the existing transaction
        const transaction = await PlatformCharges.findById(transactionId);
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
                transactionId: transaction._id,
                status: transaction.status
            });
        }

        // Update payment details
        transaction.payment = {
            ...transaction.payment,
            paymentId,
            signature,
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
            if (couponCode) {
                const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
                if (coupon) {
                    await CouponUsage.create({
                        coupon: coupon._id,
                        user: transaction.userId,
                        discountApplied: coupon.discountType === 'free_days' ?
                            (transaction.payment.gatewayResponse.notes?.extendedDays || 0) : 0
                    });
                }
            }

            if (activePlan) {
                // Queue new plan to start after current plan ends
                status = 'queued';
                startDate = new Date(activePlan.endDate);
                endDate = new Date(startDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

                await sendNotification(
                    transaction.userId,
                    'Plan Queued Successfully',
                    `Your ${validityDays}-day plan will activate on ${startDate.toLocaleDateString()}`,
                    'dashboard'
                );
            } else {
                // Activate immediately
                await sendNotification(
                    transaction.userId,
                    'Plan Activated',
                    `Your ${validityDays}-day plan is now active!`,
                    'dashboard'
                );
            }

            transaction.startDate = startDate;
            transaction.endDate = endDate;
            transaction.status = status;
        }

        await transaction.save();

        return res.status(200).json({
            success: true,
            message: `Payment verification ${payment.status === 'captured' ? 'successful' : 'failed'}`,
            transactionId: transaction._id,
            status: transaction.status,
            paymentStatus: transaction.payment.status
        });

    } catch (error) {
        console.error('Error verifying Razorpay payment:', error);
        return res.status(500).json({
            success: false,
            message: 'Error verifying payment',
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
            return res.status(400).json({ status: 'error', message: 'Invalid signature' });
        }

        const event = req.body.event;
        const payment = req.body.payload.payment?.entity;
        const order = req.body.payload.order?.entity;

        console.log(`Received Razorpay webhook event: ${event}`);

        // Handle payment captured event
        if (event === 'payment.captured') {
            const orderId = payment.order_id;

            // Find transaction by orderId
            const transaction = await PlatformCharges.findOne({
                'payment.orderId': orderId
            });

            if (!transaction) {
                console.error(`Transaction not found for orderId: ${orderId}`);
                return res.status(404).json({ status: 'error', message: 'Transaction not found' });
            }

            // Skip if already processed
            if (transaction.payment.status === 'success') {
                return res.status(200).json({ status: 'success', message: 'Already processed' });
            }

            // Update payment details
            transaction.payment = {
                ...transaction.payment,
                paymentId: payment.id,
                status: 'success',
                gatewayResponse: { payment, order },
                completedAt: new Date()
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
            if (couponCode) {
                const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
                if (coupon) {
                    await CouponUsage.create({
                        coupon: coupon._id,
                        user: transaction.userId,
                        discountApplied: coupon.discountType === 'free_days' ?
                            (order.notes?.extendedDays || 0) : 0
                    });
                }
            }

            if (activePlan) {
                // Queue new plan to start after current plan ends
                status = 'queued';
                startDate = new Date(activePlan.endDate);
                endDate = new Date(startDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

                await sendNotification(
                    transaction.userId,
                    'Plan Queued Successfully',
                    `Your ${validityDays}-day plan will activate on ${startDate.toLocaleDateString()}`,
                    'dashboard'
                );
            } else {
                // Activate immediately
                await sendNotification(
                    transaction.userId,
                    'Plan Activated',
                    `Your ${validityDays}-day plan is now active!`,
                    'dashboard'
                );
            }

            transaction.startDate = startDate;
            transaction.endDate = endDate;
            transaction.status = status;
            await transaction.save();

            console.log(`Successfully processed webhook for order ${orderId}`);
        }

        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error processing Razorpay webhook:', error);
        res.status(500).json({ status: 'error', message: error.message });
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