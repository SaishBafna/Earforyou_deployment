import { asyncHandler } from "../../../utils/asyncHandler.js";
import { ApiResponse } from "../../../utils/ApiResponse.js";
import { ApiError } from "../../../utils/ApiError.js";
import ChatPremium from "../../../models/Subscriptionchat/ChatPremium.js";
import { ChatUserPremium } from "../../../models/Subscriptionchat/ChatUserPremium.js";
import axios from "axios";
import sha256 from "sha256";
import admin from "../../../config/firebaseConfig.js";
import User from "../../../models/Users.js";
import { Coupon, CouponUsage } from "../../../models/CouponSystem/couponModel.js";


// export const validateChatPayment = asyncHandler(async (req, res) => {
//     const { merchantTransactionId, userId, planId, couponCode } = req.query;
//     let coupon = null;
//     if (couponCode) {
//         coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
//     }
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

//     // Get the plan details
//     const plan = await ChatPremium.findById(planId);

//     if (!plan) {
//         throw new ApiError(404, "Subscription plan not found");
//     }

//     // Initialize variables for coupon processing
//     let couponApplied = null;
//     let discountAmount = 0;
//     let extendedDays = 0;
//     let finalAmount = amount / 100; // Convert paisa to rupees

//     // Process coupon if provided
//     if (coupon) {
//         try {

//             if (!coupon) {
//                 throw new ApiError(404, "Coupon not found");
//             }

//             // Check coupon validity
//             if (!coupon.isUsable) {
//                 throw new ApiError(400, "Coupon is not usable (expired, inactive, or max uses reached)");
//             }

//             // Check if user has already used this coupon
//             if (!coupon.isReusable) {
//                 const existingUsage = await CouponUsage.findOne({
//                     coupon: coupon._id,
//                     user: userId
//                 });

//                 if (existingUsage) {
//                     throw new ApiError(400, "You have already used this coupon");
//                 }
//             }

//             // Check minimum order amount if applicable
//             if (coupon.minimumOrderAmount && finalAmount < coupon.minimumOrderAmount) {
//                 throw new ApiError(400, `Minimum order amount of ₹${coupon.minimumOrderAmount} required for this coupon`);
//             }

//             // Apply discount based on coupon type
//             switch (coupon.discountType) {
//                 case 'percentage':
//                     discountAmount = finalAmount * (coupon.discountValue / 100);
//                     finalAmount = finalAmount - discountAmount;
//                     break;

//                 case 'fixed':
//                     discountAmount = Math.min(coupon.discountValue, finalAmount);
//                     finalAmount = finalAmount - discountAmount;
//                     break;

//                 case 'free_days':
//                     extendedDays = coupon.discountValue;
//                     break;

//                 default:
//                     throw new ApiError(400, "Invalid coupon type");
//             }

//             // Record coupon usage


//             // Update coupon usage count
//             coupon.currentUses += 1;
//             await coupon.save();

//             couponApplied = coupon.code;
//         } catch (error) {
//             // If coupon processing fails, proceed without coupon but inform the user
//             console.error("Coupon processing error:", error.message);
//             // You might want to notify the user about the coupon error here
//         }
//     }

//     // Create payment record
//     const paymentRecord = {
//         gateway: 'PhonePe',
//         merchantTransactionId,
//         amount: amount / 100, // Original amount in rupees
//         finalAmount, // Amount after coupon discount
//         discountAmount,
//         couponApplied,
//         status: state,
//         gatewayResponse: response.data,
//         completedAt: state === 'COMPLETED' ? new Date() : null
//     };

//     // Calculate expiry date with possible coupon extension
//     let expiryDate = new Date();
//     expiryDate.setDate(expiryDate.getDate() + plan.validityDays + extendedDays);

//     // Create subscription record
//     const subscription = await ChatUserPremium.create({
//         user: userId,
//         plan: planId,
//         expiryDate,
//         remainingChats: plan.chatsAllowed,
//         isActive: state === 'COMPLETED',
//         payment: paymentRecord
//     });

//     // Send notification based on payment state
//     if (state === 'COMPLETED') {

//         let message = `Your payment of ₹${paymentRecord.finalAmount} for premium chat features was successful.`;
//         if (couponApplied) {
//             message += ` (Coupon ${couponApplied} applied, saved ₹${discountAmount})`;
//         }
//         if (extendedDays > 0) {
//             message += ` Your subscription has been extended by ${extendedDays} days.`;
//         }
//         message += ' Enjoy your subscription!';

//         await sendNotification(
//             userId,
//             'Payment Successful',
//             message
//         );
//         if (coupon) {
//             await CouponUsage.create({
//                 coupon: coupon._id,
//                 user: userId,
//                 discountApplied: discountAmount
//             });
//         }
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


export const validateChatPayment = asyncHandler(async (req, res) => {
    const { merchantTransactionId, userId, planId, couponCode } = req.query;

    // Validate required parameters
    if (!merchantTransactionId || !userId || !planId) {
        throw new ApiError(400, "Missing required parameters");
    }

    // Check if this transaction already exists
    const existingSubscription = await ChatUserPremium.findOne({
        "payment.transactionId": merchantTransactionId
    });

    if (existingSubscription) {
        return res.status(200).json(
            new ApiResponse(200, existingSubscription, "Payment already processed")
        );
    }

    // Verify payment status with PhonePe
    const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
    const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
    const xVerifyChecksum = `${sha256(stringToHash)}###${process.env.SALT_INDEX}`;

    const response = await axios.get(statusUrl, {
        headers: {
            "Content-Type": "application/json",
            "X-VERIFY": xVerifyChecksum,
            "X-MERCHANT-ID": process.env.MERCHANT_ID,
        },
    });

    const { code, data } = response.data;
    const { state, amount } = data;

    // Get the plan details
    const plan = await ChatPremium.findById(planId);

    if (!plan) {
        throw new ApiError(404, "Subscription plan not found");
    }

    // Initialize coupon variables
    let coupon = null;
    let couponApplied = null;
    let discountAmount = 0;
    let extendedDays = 0;
    let finalAmount = amount / 100; // Convert paisa to rupees
    let couponMessage = '';

    // Process coupon if provided
    if (couponCode) {
        try {
            coupon = await Coupon.findOne({
                code: couponCode.toUpperCase(),
                isActive: true
            });

            if (coupon) {
                // Validate coupon


                const now = new Date();
                if (coupon.validFrom && now < coupon.validFrom) {
                    throw new ApiError(400, "This coupon is not valid yet");
                }
                if (coupon.validUntil && now > coupon.validUntil) {
                    throw new ApiError(400, "This coupon has expired");
                }
                if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
                    throw new ApiError(400, "This coupon has reached its maximum usage limit");
                }

                // Check if user has already used this coupon (for non-reusable coupons)
                if (!coupon.isReusable) {
                    const existingUsage = await CouponUsage.findOne({
                        coupon: coupon._id,
                        user: userId
                    });

                    if (existingUsage) {
                        throw new ApiError(400, "You have already used this coupon");
                    }
                }

                // Check minimum order amount if applicable
                if (coupon.minimumOrderAmount && finalAmount < coupon.minimumOrderAmount) {
                    throw new ApiError(400, `Minimum order amount of ₹${coupon.minimumOrderAmount} required for this coupon`);
                }


                // NEW: Validate coupon applicability to this pricing type and plan
                if (!coupon.isApplicableToPricingType('chat')) {
                    throw new ApiError(400, "This coupon cannot be used for chat services");
                }

                // NEW: Check if coupon is restricted to specific pricing IDs
                if (coupon.applicablePricingIds.length > 0 &&
                    !coupon.isApplicableToPricingId(planId)) {
                    throw new ApiError(400, "This coupon cannot be used with this plan");
                }

                
                // Apply discount based on coupon type
                switch (coupon.discountType) {
                    case 'percentage':
                        extendedDays = (coupon.discountValue / 100) * plan.validityDays;
                        couponMessage = `Added ${extendedDays.toFixed(1)} extra days (${coupon.discountValue}% of plan duration)`;

                        break;

                    case 'fixed':
                        discountAmount = Math.min(coupon.discountValue, finalAmount);
                        finalAmount = finalAmount - discountAmount;
                        couponMessage = `Applied ₹${discountAmount.toFixed(2)} discount`;
                        break;

                    case 'free_days':
                        extendedDays = coupon.discountValue;
                        couponMessage = `Added ${extendedDays} free days to your subscription`;
                        break;

                    default:
                        throw new ApiError(400, "Invalid coupon type");
                }

                // Update coupon usage count
                extendedDays = Math.round(extendedDays * 2) / 2;
                coupon.currentUses += 1;
                await coupon.save();
                couponApplied = coupon.code;
            }
        } catch (error) {
            console.error("Coupon processing error:", error.message);
            // Send notification about coupon error but proceed with payment
            if (error instanceof ApiError) {
                await sendNotification(
                    userId,
                    'Coupon Error',
                    error.message,
                    'Payment'
                );
            }
        }
    }

    // Map payment status to schema enum values
    const paymentStatusMap = {
        'COMPLETED': 'success',
        'FAILED': 'failed',
        'PENDING': 'pending'
    };

    const paymentStatus = paymentStatusMap[state] || 'pending';

    // Calculate expiry date with possible coupon extension
    let expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + plan.validityDays + extendedDays);

    // Create payment record according to new schema
    const paymentRecord = {
        gateway: 'PhonePe',
        transactionId: merchantTransactionId,
        amount: finalAmount,
        originalAmount: amount / 100,
        discountAmount: discountAmount,
        currency: "INR",
        status: paymentStatus,
        couponUsed: couponApplied,
        gatewayResponse: response.data,
        completedAt: paymentStatus === 'success' ? new Date() : null
    };

    // Create subscription record using the schema method
    const subscription = await ChatUserPremium.create({
        user: userId,
        plan: planId,
        expiryDate: expiryDate,
        remainingChats: plan.chatsAllowed,
        isActive: paymentStatus === 'success',
        payment: paymentRecord
    });

    // Send notification based on payment state
    if (paymentStatus === 'success') {
        let message = `Your payment of ₹${finalAmount.toFixed(2)} for ${plan.name} was successful.`;

        if (couponApplied) {
            message += ` ${couponMessage}`;
        }

        message += ' Enjoy your premium features!';

        await sendNotification(
            userId,
            'Payment Successful',
            message,
            'PremiumChat'
        );

        // Record coupon usage if applied successfully
        if (coupon && couponApplied) {
            await CouponUsage.create({
                coupon: coupon._id,
                user: userId,
                transactionId: merchantTransactionId,
                discountApplied: discountAmount,
                freeDaysApplied: extendedDays,
                finalAmount: finalAmount
            });
        }
    } else if (paymentStatus === 'failed') {
        await sendNotification(
            userId,
            'Payment Failed',
            `Your payment of ₹${finalAmount.toFixed(2)} for ${plan.name} failed. Please try again.`,
            'Payment'
        );
    }

    return res.status(200).json(
        new ApiResponse(200, subscription, `Payment ${state.toLowerCase()} and subscription recorded`)
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



// @desc    Update a chat premium plan
// Get paginated premium user data
export const getPaginatedPremiumUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get the total count for pagination info
        const total = await ChatUserPremium.countDocuments();

        // Get the paginated data with necessary population
        const premiumUsers = await ChatUserPremium.find()
            .populate('user', 'username email') // Only get name and email from user
            .populate('plan', 'name chatsAllowed validityDays price') // Get relevant plan info
            .sort({ createdAt: -1 }) // Newest first
            .skip(skip)
            .limit(limit)
            .lean(); // Convert to plain JS objects

        // Format the data for display
        const formattedData = premiumUsers.map(user => ({
            id: user._id,
            userName: user.user?.username || 'N/A',
            userEmail: user.user?.email || 'N/A',
            planName: user.plan?.name || 'N/A',
            purchaseDate: user.purchaseDate.toLocaleDateString(),
            expiryDate: user.expiryDate.toLocaleDateString(),
            remainingChats: user.remainingChats,
            usedChats: user.usedChats.length,
            isActive: user.isActive,
            paymentStatus: user.payment.status,
            paymentAmount: user.payment.amount,
            paymentCurrency: user.payment.currency
        }));

        res.json({
            success: true,
            data: formattedData,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch premium users',
            error: error.message
        });
    }
};


// @desc    Get premium details of a specific user
export const getPremiumUserDetails = async (req, res) => {
    try {
        const { userId } = req.params; // Get userId from URL params

        // Find ALL premium details for the specific user, sorted by newest first
        const premiumRecords = await ChatUserPremium.find({ user: userId })
            .sort({ createdAt: -1 }) // Get the latest records first
            .populate('user', 'username email')
            .populate('plan', 'name chatsAllowed validityDays price')
            .lean();

        if (!premiumRecords || premiumRecords.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No premium subscriptions found for this user'
            });
        }

        // Filter active subscriptions and calculate total remaining chats
        const activeSubscriptions = premiumRecords.filter(record => record.isActive);
        const totalRemainingChats = activeSubscriptions.reduce(
            (sum, record) => sum + (record.remainingChats || 0), 0
        );

        // Get the most recent subscription (active or inactive) for detailed info
        const latestSubscription = premiumRecords[0];

        // Calculate usage stats based on latest subscription
        const totalChatsAllowed = latestSubscription.plan?.chatsAllowed || 0;
        const usedChats = latestSubscription.usedChats?.length || 0;

        // Format the response
        const response = {
            id: latestSubscription._id,
            userInfo: {
                name: latestSubscription.user?.username || 'N/A',
                email: latestSubscription.user?.email || 'N/A'
            },
            planInfo: {
                name: latestSubscription.plan?.name || 'N/A',
                details: {
                    chatsAllowed: totalChatsAllowed,
                    validityDays: latestSubscription.plan?.validityDays || 0,
                    price: latestSubscription.plan?.price || 0
                }
            },
            usageStats: {
                totalChatsAllowed,
                remainingChats: totalRemainingChats, // This now includes sum of all active subscriptions
                usedChats,
                usagePercentage: totalChatsAllowed > 0
                    ? Math.round((usedChats / totalChatsAllowed) * 100)
                    : 0
            },
            dates: {
                purchaseDate: latestSubscription.purchaseDate?.toLocaleDateString?.() || 'N/A',
                expiryDate: latestSubscription.expiryDate?.toLocaleDateString?.() || 'N/A',
                createdAt: latestSubscription.createdAt?.toISOString() || 'N/A'
            },
            paymentInfo: {
                status: latestSubscription.payment?.status || 'N/A',
                amount: latestSubscription.payment?.amount || 0,
                currency: latestSubscription.payment?.currency || 'N/A',
                date: latestSubscription.payment?.completedAt?.toLocaleDateString?.() || 'N/A',
                method: latestSubscription.payment?.method || 'N/A',
                transactionId: latestSubscription.payment?.merchantTransactionId || 'N/A'
            },
            isActive: latestSubscription.isActive || false,
            activeSubscriptionsCount: activeSubscriptions.length // Additional info about active subscriptions
        };

        res.json({
            success: true,
            data: response
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch premium user details',
            error: error.message
        });
    }
};
