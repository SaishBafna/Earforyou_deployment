import { asyncHandler } from "../../../utils/asyncHandler.js";
import { ApiResponse } from "../../../utils/ApiResponse.js";
import { ApiError } from "../../../utils/ApiError.js";
import ChatPremium from "../../../models/Subscriptionchat/ChatPremium.js";
import { ChatUserPremium } from "../../../models/Subscriptionchat/ChatUserPremium.js";
import axios from "axios";
import sha256 from "sha256";
import admin from "../../../config/firebaseConfig.js";
import User from "../../../models/Users.js";
import {
    validateAndApplyCoupon, recordCouponTransaction
} from "../../../utils/couponHelper.js";

// export const validateChatPayment = asyncHandler(async (req, res) => {
//     const { merchantTransactionId, userId, planId } = req.query;

//     // Validate required parameters
//     if (!merchantTransactionId || !userId || !planId) {
//         throw new ApiError(400, "Missing required parameters");
//     }

//     // Check if this transaction already exists
//     const existingSubscription = await ChatUserPremium.findOne({
//         "payment.merchantTransactionId": merchantTransactionId
//     });

//     if (existingSubscription) {
//         return res.status(200).json(
//             new ApiResponse(200, existingSubscription, "Payment already processed")
//         );
//     }

//     // Verify payment status with PhonePe
//     const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
//     const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
//     const xVerifyChecksum = `${sha256(stringToHash)}###${process.env.SALT_INDEX}`;

//     const response = await axios.get(statusUrl, {
//         headers: {
//             "Content-Type": "application/json",
//             "X-VERIFY": xVerifyChecksum,
//             "X-MERCHANT-ID": process.env.MERCHANT_ID,
//         },
//     });

//     const { code, data } = response.data;
//     const { state, amount } = data;

//     // Create payment record
//     const paymentRecord = {
//         merchantTransactionId,
//         amount: amount / 100, // Convert paisa to rupees
//         status: state,
//         gatewayResponse: response.data,
//         completedAt: state === 'COMPLETED' ? new Date() : null
//     };

//     // Create subscription record
//     const subscription = await ChatUserPremium.createFromPayment(
//         userId,
//         planId,
//         paymentRecord
//     );

//     // Send notification based on payment state
//     if (state === 'COMPLETED') {
//         await sendNotification(
//             userId,
//             'Payment Successful',
//             `Your payment of ₹${paymentRecord.amount} for premium chat features was successful. Enjoy your subscription!`
//         );
//     } else if (state === 'FAILED') {
//         await sendNotification(
//             userId,
//             'Payment Failed',
//             'Your payment for premium chat features failed. Please try again.'
//         );
//     }

//     return res.status(200).json(
//         new ApiResponse(200, subscription, `Payment ${state.toLowerCase()} and subscription recorded`)
//     );
// });

// Helper function to send notifications




export const validateChatPayment = asyncHandler(async (req, res) => {
    const { merchantTransactionId, userId, planId, couponCode } = req.query;

    // Validate parameters
    if (!merchantTransactionId || !userId || !planId) {
        throw new ApiError(400, "Missing required parameters");
    }

    // Get user and plan
    const [user, plan] = await Promise.all([
        User.findById(userId),
        ChatPremium.findById(planId)
    ]);

    if (!user) throw new ApiError(404, "User not found");
    if (!plan) throw new ApiError(404, "Plan not found");

    // Initialize payment variables
    let originalAmount = plan.price;
    let finalAmount = originalAmount;
    let discountAmount = 0;
    let extraValidityDays = 0;
    let coupon = null;
    let couponError = null;

    // Validate and apply coupon if provided
    if (couponCode) {
        try {
            // First validate the coupon
            const couponResult = await validateAndApplyCoupon(
                couponCode,
                userId,
                originalAmount,
                user.isStaff,
                'days'
            );

            if (couponResult.isValid) {
                coupon = couponResult.coupon;
                finalAmount = couponResult.finalAmount;
                discountAmount = couponResult.discountAmount;
                extraValidityDays = couponResult.freeDays || 0;

                console.log("Coupon applied successfully:", {
                    code: coupon.code,
                    discountAmount,
                    extraValidityDays
                });
            }
        } catch (error) {
            couponError = error.message;
            console.error("Coupon validation failed:", couponError);
            // Continue with normal payment if coupon is invalid
        }
    }

    // Check for existing transaction
    if (await ChatUserPremium.exists({ "payment.merchantTransactionId": merchantTransactionId })) {
        throw new ApiError(400, "Transaction already processed");
    }

    // Verify payment with PhonePe
    const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
    const checksum = `${sha256(`/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`)}###${process.env.SALT_INDEX}`;

    const response = await axios.get(statusUrl, {
        headers: {
            "Content-Type": "application/json",
            "X-VERIFY": checksum,
            "X-MERCHANT-ID": process.env.MERCHANT_ID,
        },
        timeout: 10000 // 10 seconds timeout
    });

    const { code, data } = response.data;
    const { state, amount } = data;

    // Validate payment amount matches expected amount (after coupon discount)
    if (state === 'COMPLETED') {
        const paidAmount = amount ? amount / 100 : 0;
        if (paidAmount !== finalAmount) {
            throw new ApiError(400, `Amount mismatch. Expected ₹${finalAmount}, got ₹${paidAmount}`);
        }
    }

    // Prepare payment record
    const paymentRecord = {
        merchantTransactionId,
        amount: amount ? amount / 100 : finalAmount,
        originalAmount,
        discountAmount,
        status: state,
        gatewayResponse: response.data,
        completedAt: state === 'COMPLETED' ? new Date() : null,
        couponDetails: coupon ? {
            applied: true,
            code: coupon.code,
            couponId: coupon._id,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            extraValidityDays
        } : {
            applied: false,
            error: couponError || null
        }
    };

    // Create subscription
    const subscription = await ChatUserPremium.createFromPayment(
        userId,
        planId,
        paymentRecord
    );

    // Record coupon usage if payment was successful and coupon was applied
    if (state === 'COMPLETED' && coupon) {
        await recordCouponTransaction(
            coupon._id,
            userId,
            merchantTransactionId,
            discountAmount
        );
        console.log("Coupon usage recorded successfully");
    }

    // Send appropriate notification
    const notificationTitle = state === 'COMPLETED' 
        ? 'Payment Successful' 
        : 'Payment Failed';
    
    const notificationMessage = state === 'COMPLETED'
        ? `Your ${plan.name} plan is now active! ${extraValidityDays > 0 ? `+${extraValidityDays} free days!` : ''}`
        : 'Payment failed. Please try again.';

    await sendNotification(
        userId,
        notificationTitle,
        notificationMessage,
        'premium_chat'
    );

    return res.status(200).json(
        new ApiResponse(200, {
            subscription,
            couponApplied: !!coupon,
            discountAmount,
            extraValidityDays,
            paymentStatus: state
        }, state === 'COMPLETED' ? 'Payment processed successfully' : 'Payment processing failed')
    );
});


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


// export const validateChatPayment = asyncHandler(async (req, res) => {
//   const { merchantTransactionId, userId, planId } = req.query;

//   // Validate required parameters
//   if (!merchantTransactionId || !userId || !planId) {
//     throw new ApiError(400, "Missing required parameters");
//   }

//   // Check if this transaction already exists
//   const existingSubscription = await ChatUserPremium.findOne({
//     "payment.merchantTransactionId": merchantTransactionId
//   });

//   if (existingSubscription) {
//     return res.status(200).json(
//       new ApiResponse(200, existingSubscription, "Payment already processed")
//     );
//   }

//   // Verify payment status with PhonePe
//   const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
//   const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
//   const xVerifyChecksum = `${sha256(stringToHash)}###${process.env.SALT_INDEX}`;

//   const response = await axios.get(statusUrl, {
//     headers: {
//       "Content-Type": "application/json",
//       "X-VERIFY": xVerifyChecksum,
//       "X-MERCHANT-ID": process.env.MERCHANT_ID,
//     },
//   });

//   const { code, data } = response.data;
//   const { state, amount } = data;

//   // Create payment record
//   const paymentRecord = {
//     merchantTransactionId,
//     amount: amount / 100, // Convert paisa to rupees
//     status: state,
//     gatewayResponse: response.data,
//     completedAt: state === 'COMPLETED' ? new Date() : null
//   };

//   // Create subscription record
//   const subscription = await ChatUserPremium.createFromPayment(
//     userId,
//     planId,
//     paymentRecord
//   );

//   return res.status(200).json(
//     new ApiResponse(200, subscription, `Payment ${state.toLowerCase()} and subscription recorded`)
//   );
// });






// @desc    Create a new chat premium plan
// @route   POST /api/chat-premium
// @access  Private/Admin

export const createChatPremium = async (req, res) => {
    try {
        const { name, price, chatsAllowed, validityDays, isActive } = req.body;

        // Check if plan with same name already exists
        const existingPlan = await ChatPremium.findOne({ name });
        if (existingPlan) {
            return res.status(400).json({
                success: false,
                message: "A plan with this name already exists"
            });
        }

        const newPlan = new ChatPremium({
            name,
            price,
            chatsAllowed,
            validityDays,
            isActive: isActive !== undefined ? isActive : true
        });

        const savedPlan = await newPlan.save();

        res.status(201).json({
            success: true,
            data: savedPlan,
            message: "Chat premium plan created successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Failed to create chat premium plan"
        });
    }
};

// @desc    Get all chat premium plans
// @route   GET /api/chat-premium
// @access  Public

export const getAllChatPremiumPlans = async (req, res) => {
    try {
        const { activeOnly } = req.query;

        let query = {};
        if (activeOnly === 'true') {
            query.isActive = true;
        }

        const plans = await ChatPremium.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: plans.length,
            data: plans
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch chat premium plans"
        });
    }
};
