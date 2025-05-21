import PlatformCharges from "../../../models/Wallet/PlatfromCharges/Platfrom.js";
import { createHash } from 'crypto'; // Correct import
import axios from 'axios';
import sha256 from "sha256";
import uniqid from "uniqid";
import User from "../../../models/Users.js";
import MyPlan from "../../../models/Wallet/PlatfromCharges/myPlanSchema.js";
import admin from 'firebase-admin';
import { Coupon, CouponUsage } from "../../../models/CouponSystem/couponModel.js";


// Adjust model imports as needed






// export const validatePayment = async (req, res) => {
//     const { merchantTransactionId, userId, planId, couponCode } = req.query;
//     let coupon = null;

//     try {
//         console.log("Payment validation initiated", {
//             merchantTransactionId,
//             userId,
//             planId,
//             couponCode,
//             timestamp: new Date().toISOString()
//         });

//         // Validate input parameters
//         if (!merchantTransactionId || !userId || !planId) {
//             console.log("Missing required parameters");
//             return res.status(400).json({
//                 success: false,
//                 message: 'Missing merchantTransactionId, userId, or planId'
//             });
//         }

//         // Get plan details
//         const planDetails = await MyPlan.findById(planId);
//         if (!planDetails) {
//             console.log("Plan not found", { planId });
//             return res.status(404).json({
//                 success: false,
//                 message: 'Plan details not found'
//             });
//         }

//         // Check for existing transaction
//         const existingTransaction = await PlatformCharges.findOne({
//             "payment.transactionId": merchantTransactionId
//         });
//         if (existingTransaction) {
//             console.log("Duplicate transaction found", {
//                 status: existingTransaction.status,
//                 createdAt: existingTransaction.createdAt
//             });
//             return res.status(400).json({
//                 success: false,
//                 error: "Transaction already exists",
//                 currentStatus: existingTransaction.status
//             });
//         }

//         // Process coupon if provided
//         if (couponCode) {
//             coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
//         }

//         let validityDays = planDetails.validityDays;
//         let couponDetails = null;
//         let extendedDays = 0;

//         // Process coupon if valid
//         if (coupon) {
//             try {
//                 console.log("Processing coupon code", { couponCode });

//                 if (!coupon.isUsable) {
//                     throw new Error("Coupon is not usable");
//                 }

//                 if (!coupon.isReusable) {
//                     const existingUsage = await CouponUsage.findOne({
//                         coupon: coupon._id,
//                         user: userId
//                     });
//                     if (existingUsage) {
//                         return res.status(400).json({
//                             success: false,
//                             message: "You have already used this coupon"
//                         });
//                     }
//                 }

//                 if (coupon.minimumOrderAmount && planDetails.amount < coupon.minimumOrderAmount) {
//                     throw new Error(`Minimum order amount of ₹${coupon.minimumOrderAmount} required`);
//                 }

//                 if (coupon.discountType === 'free_days') {
//                     extendedDays = coupon.discountValue;
//                     validityDays += extendedDays;
//                     console.log("Extended validity days", { extendedDays, newValidity: validityDays });
//                 }

//                 // Update coupon usage count
//                 coupon.currentUses += 1;
//                 await coupon.save();

//                 couponDetails = {
//                     code: coupon.code,
//                     discountType: coupon.discountType,
//                     discountValue: coupon.discountValue,
//                     extendedDays: extendedDays
//                 };

//             } catch (couponError) {
//                 console.error("Coupon processing failed", {
//                     error: couponError.message,
//                     couponCode
//                 });
//                 return res.status(400).json({
//                     success: false,
//                     message: `Coupon error: ${couponError.message}`
//                 });
//             }
//         }

//         // Verify payment with PhonePe
//         const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
//         const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
//         const sha256Hash = createHash('sha256').update(stringToHash).digest('hex');
//         const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

//         console.log("Verifying payment with PhonePe");
//         const response = await axios.get(statusUrl, {
//             headers: {
//                 "Content-Type": "application/json",
//                 "X-VERIFY": xVerifyChecksum,
//                 "X-MERCHANT-ID": process.env.MERCHANT_ID,
//                 "accept": "application/json",
//             },
//             timeout: 10000
//         });

//         const responseData = response.data;
//         console.log("PhonePe response", { status: responseData?.data?.state });

//         if (!responseData.success || !responseData.data) {
//             throw new Error("Invalid response from payment gateway");
//         }

//         const paymentState = responseData.data.state;
//         const paymentCode = responseData.code;

//         // Map payment status to our schema
//         const paymentStatusMap = {
//             'COMPLETED': 'success',
//             'PENDING': 'pending',
//             'FAILED': 'failed'
//         };
//         const paymentStatus = paymentStatusMap[paymentState] || 'pending';

//         // Create payment details object according to schema
//         const paymentDetails = {
//             gateway: 'PhonePe',
//             transactionId: merchantTransactionId,
//             amount: planDetails.amount,
//             currency: 'INR',
//             status: paymentStatus,
//             gatewayResponse: responseData,
//             completedAt: paymentStatus === 'success' ? new Date() : null
//         };

//         // Calculate plan dates
//         const now = new Date();
//         let startDate = now;
//         let endDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
//         let status = 'processing';

//         // Check for existing active plans if payment is successful
//         if (paymentStatus === 'success') {
//             const activePlan = await PlatformCharges.findOne({
//                 userId,
//                 status: 'active',
//                 endDate: { $gt: now }
//             }).sort({ endDate: -1 });

//             if (coupon) {
//                 await CouponUsage.create({
//                     coupon: coupon._id,
//                     user: userId,
//                     discountApplied: coupon.discountType === 'free_days' ? extendedDays : 0
//                 });
//             }

//             if (activePlan) {
//                 // Queue new plan to start after current plan ends
//                 status = 'queued';
//                 startDate = new Date(activePlan.endDate);
//                 endDate = new Date(startDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

//                 await sendNotification(
//                     userId,
//                     'Plan Queued Successfully',
//                     `Your ${validityDays}-day plan will activate on ${startDate.toLocaleDateString()}`,
//                     'dashboard'
//                 );
//             } else {
//                 // Activate immediately
//                 status = 'active';
//                 await sendNotification(
//                     userId,
//                     'Plan Activated',
//                     `Your ${validityDays}-day plan is now active!`,
//                     'dashboard'
//                 );
//             }
//         }

//         // Create transaction record
//         const transaction = await PlatformCharges.create({
//             userId,
//             planId,
//             planName: planDetails.planName || "Platform Charges",
//             startDate: paymentStatus === 'success' ? startDate : null,
//             endDate: paymentStatus === 'success' ? endDate : null,
//             status: paymentStatus === 'success' ? status : paymentStatus,
//             payment: paymentDetails
//         });

//         console.log("Transaction created", { transactionId: transaction._id });

//         // Handle different payment states
//         switch (paymentStatus) {
//             case 'success':
//                 return res.status(200).json({
//                     success: true,
//                     message: `Payment successful - Plan ${transaction.status}`,
//                     data: {
//                         planId: transaction._id,
//                         status: transaction.status,
//                         startDate,
//                         endDate,
//                         validityDays,
//                         couponDetails
//                     }
//                 });

//             case 'pending':
//                 await sendNotification(
//                     userId,
//                     'Payment Pending',
//                     'Your payment is still processing. We will notify you when completed.',
//                     'dashboard'
//                 );

//                 return res.status(202).json({
//                     success: false,
//                     message: 'Payment pending',
//                     transactionId: transaction._id
//                 });

//             default:
//                 // Failed payment
//                 await sendNotification(
//                     userId,
//                     'Payment Failed',
//                     'Your payment could not be processed. Please try again.',
//                     'wallet'
//                 );

//                 return res.status(400).json({
//                     success: false,
//                     message: 'Payment failed',
//                     transactionId: transaction._id
//                 });
//         }

//     } catch (error) {
//         console.error("Payment validation error", {
//             error: error.message,
//             stack: error.stack,
//             userId,
//             merchantTransactionId,
//             timestamp: new Date().toISOString()
//         });

//         await sendNotification(
//             userId,
//             'Payment Error',
//             'An error occurred while processing your payment. Our team has been notified.',
//             'wallet'
//         ).catch(e => console.error("Failed to send notification", e));

//         return res.status(500).json({
//             success: false,
//             message: 'Payment processing error',
//             error: error.message
//         });
//     }
// };






export const validatePayment = async (req, res) => {
    const { merchantTransactionId, userId, planId, couponCode } = req.query;
    let coupon = null;

    try {
        console.log("Payment validation initiated", {
            merchantTransactionId,
            userId,
            planId,
            couponCode,
            timestamp: new Date().toISOString()
        });

        // Validate input parameters
        if (!merchantTransactionId || !userId || !planId) {
            console.log("Missing required parameters");
            return res.status(400).json({
                success: false,
                message: 'Missing merchantTransactionId, userId, or planId'
            });
        }

        // Get plan details
        const planDetails = await MyPlan.findById(planId);
        if (!planDetails) {
            console.log("Plan not found", { planId });
            return res.status(404).json({
                success: false,
                message: 'Plan details not found'
            });
        }

        // Check for existing transaction
        const existingTransaction = await PlatformCharges.findOne({
            "payment.transactionId": merchantTransactionId
        });
        if (existingTransaction) {
            console.log("Duplicate transaction found", {
                status: existingTransaction.status,
                createdAt: existingTransaction.createdAt
            });
            return res.status(400).json({
                success: false,
                error: "Transaction already exists",
                currentStatus: existingTransaction.status
            });
        }

        // Process coupon if provided
        if (couponCode) {
            coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
        }

        let validityDays = planDetails.validityDays;
        let couponDetails = null;
        let extendedDays = 0;

        // Process coupon if valid (MODIFIED TO ONLY ADD DAYS)
        if (coupon) {
            try {
                console.log("Processing coupon code", { couponCode });

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

                // MODIFIED: Convert all coupon types to extra days
                switch (coupon.discountType) {
                    case 'percentage':
                        // Calculate extra days = (discount %) × plan duration
                        extendedDays = (coupon.discountValue / 100) * planDetails.validityDays;
                        console.log("Percentage coupon applied", {
                            discountPercent: coupon.discountValue,
                            extraDays: extendedDays
                        });
                        break;

                    case 'fixed':
                        // Calculate extra days = (fixed discount) / (daily rate)
                        const dailyRate = planDetails.amount / planDetails.validityDays;
                        extendedDays = coupon.discountValue / dailyRate;
                        console.log("Fixed coupon applied", {
                            discountAmount: coupon.discountValue,
                            dailyRate,
                            extraDays: extendedDays
                        });
                        break;

                    case 'free_days':
                        extendedDays = coupon.discountValue;
                        console.log("Free days coupon applied", { extraDays: extendedDays });
                        break;

                    default:
                        throw new Error("Invalid coupon type");
                }

                // Round to nearest 0.5 days (optional)
                extendedDays = Math.round(extendedDays * 2) / 2;
                validityDays += extendedDays;

                console.log("Extended validity days", {
                    originalDays: planDetails.validityDays,
                    extendedDays,
                    newValidity: validityDays
                });

                // Update coupon usage count
                coupon.currentUses += 1;
                await coupon.save();

                couponDetails = {
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountValue: coupon.discountValue,
                    extendedDays: extendedDays
                };

            } catch (couponError) {
                console.error("Coupon processing failed", {
                    error: couponError.message,
                    couponCode
                });
                return res.status(400).json({
                    success: false,
                    message: `Coupon error: ${couponError.message}`
                });
            }
        }

        // Verify payment with PhonePe (remaining code unchanged...)
        const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
        const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
        const sha256Hash = createHash('sha256').update(stringToHash).digest('hex');
        const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

        console.log("Verifying payment with PhonePe");
        const response = await axios.get(statusUrl, {
            headers: {
                "Content-Type": "application/json",
                "X-VERIFY": xVerifyChecksum,
                "X-MERCHANT-ID": process.env.MERCHANT_ID,
                "accept": "application/json",
            },
            timeout: 10000
        });

        const responseData = response.data;
        console.log("PhonePe response", { status: responseData?.data?.state });

        if (!responseData.success || !responseData.data) {
            throw new Error("Invalid response from payment gateway");
        }

        const paymentState = responseData.data.state;
        const paymentCode = responseData.code;

        // Map payment status to our schema
        const paymentStatusMap = {
            'COMPLETED': 'success',
            'PENDING': 'pending',
            'FAILED': 'failed'
        };
        const paymentStatus = paymentStatusMap[paymentState] || 'pending';

        // Create payment details object (amount remains unchanged)
        const paymentDetails = {
            gateway: 'PhonePe',
            transactionId: merchantTransactionId,
            amount: planDetails.amount, // Original amount (no discount)
            currency: 'INR',
            status: paymentStatus,
            couponUsed: coupon?.code || null,
            extendedDays: extendedDays, // Track bonus days
            gatewayResponse: responseData,
            completedAt: paymentStatus === 'success' ? new Date() : null
        };

        // Calculate plan dates with extended validity
        const now = new Date();
        let startDate = now;
        let endDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
        let status = 'processing';

        // Check for existing active plans if payment is successful
        if (paymentStatus === 'success') {
            const activePlan = await PlatformCharges.findOne({
                userId,
                status: 'active',
                endDate: { $gt: now }
            }).sort({ endDate: -1 });

            // Record coupon usage (tracking extended days)
            if (coupon) {
                await CouponUsage.create({
                    coupon: coupon._id,
                    user: userId,
                    transactionId: merchantTransactionId,
                    discountApplied: 0, // No monetary discount
                    freeDaysApplied: extendedDays, // Track bonus days
                    finalAmount: planDetails.amount // Original amount
                });
            }

            if (activePlan) {
                // Queue new plan to start after current plan ends
                status = 'queued';
                startDate = new Date(activePlan.endDate);
                endDate = new Date(startDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

                await sendNotification(
                    userId,
                    'Plan Queued Successfully',
                    `Your ${validityDays}-day plan (with ${extendedDays} bonus days) will activate on ${startDate.toLocaleDateString()}`,
                    'dashboard'
                );
            } else {
                // Activate immediately
                status = 'active';
                await sendNotification(
                    userId,
                    'Plan Activated',
                    `Your ${validityDays}-day plan (with ${extendedDays} bonus days) is now active!`,
                    'dashboard'
                );
            }
        }

        // Create transaction record
        const transaction = await PlatformCharges.create({
            userId,
            planId,
            planName: planDetails.planName || "Platform Charges",
            startDate: paymentStatus === 'success' ? startDate : null,
            endDate: paymentStatus === 'success' ? endDate : null,
            status: paymentStatus === 'success' ? status : paymentStatus,
            payment: paymentDetails
        });

        console.log("Transaction created", {
            transactionId: transaction._id,
            validityDays,
            extendedDays
        });

        // Handle different payment states
        switch (paymentStatus) {
            case 'success':
                return res.status(200).json({
                    success: true,
                    message: `Payment successful - Plan ${transaction.status}`,
                    data: {
                        planId: transaction._id,
                        status: transaction.status,
                        startDate,
                        endDate,
                        validityDays,
                        extendedDays, // Include in response
                        couponDetails
                    }
                });

            case 'pending':
                await sendNotification(
                    userId,
                    'Payment Pending',
                    'Your payment is still processing. We will notify you when completed.',
                    'dashboard'
                );

                return res.status(202).json({
                    success: false,
                    message: 'Payment pending',
                    transactionId: transaction._id
                });

            default:
                // Failed payment
                await sendNotification(
                    userId,
                    'Payment Failed',
                    'Your payment could not be processed. Please try again.',
                    'wallet'
                );

                return res.status(400).json({
                    success: false,
                    message: 'Payment failed',
                    transactionId: transaction._id
                });
        }

    } catch (error) {
        console.error("Payment validation error", {
            error: error.message,
            stack: error.stack,
            userId,
            merchantTransactionId,
            timestamp: new Date().toISOString()
        });

        await sendNotification(
            userId,
            'Payment Error',
            'An error occurred while processing your payment. Our team has been notified.',
            'wallet'
        ).catch(e => console.error("Failed to send notification", e));

        return res.status(500).json({
            success: false,
            message: 'Payment processing error',
            error: error.message
        });
    }
};
// Additional endpoint to check pending payments
export const checkPendingPayment = async (req, res) => {
    const { transactionId } = req.params;

    try {
        const transaction = await PlatformCharges.findOne({ transactionId });
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        // If transaction is already completed/queued
        if (['active', 'queued', 'queued_confirmed'].includes(transaction.status)) {
            return res.status(200).json({
                success: true,
                status: transaction.status,
                message: 'Payment already processed'
            });
        }

        // If transaction failed
        if (transaction.status === 'failed') {
            return res.status(400).json({
                success: false,
                status: 'failed',
                message: transaction.error || 'Payment failed'
            });
        }

        // For pending/processing transactions, check with payment gateway
        const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${transactionId}`;
        const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${transactionId}${process.env.SALT_KEY}`;
        const sha256Hash = createHash('sha256').update(stringToHash).digest('hex');
        const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

        const response = await axios.get(statusUrl, {
            headers: {
                "Content-Type": "application/json",
                "X-VERIFY": xVerifyChecksum,
                "X-MERCHANT-ID": process.env.MERCHANT_ID,
                "accept": "application/json",
            },
            timeout: 10000
        });

        const responseData = response.data;

        // Update transaction based on new status
        if (responseData.code === "PAYMENT_SUCCESS" && responseData.data.state === "COMPLETED") {
            transaction.status = 'active'; // Will be adjusted in subsequent processing
            transaction.paymentResponse = responseData;
            await transaction.save();

            // You might want to call validatePayment again or process the completion here
            return res.status(200).json({
                success: true,
                status: 'completed',
                message: 'Payment completed successfully'
            });
        } else if (responseData.code === "PAYMENT_PENDING" || responseData.data.state === "PENDING") {
            transaction.status = 'pending';
            transaction.paymentResponse = responseData;
            await transaction.save();

            return res.status(202).json({
                success: false,
                status: 'pending',
                message: 'Payment is still pending'
            });
        } else {
            transaction.status = 'failed';
            transaction.error = responseData.message || 'Payment failed';
            transaction.paymentResponse = responseData;
            await transaction.save();

            return res.status(400).json({
                success: false,
                status: 'failed',
                message: 'Payment failed at gateway'
            });
        }

    } catch (error) {
        console.error("Error checking pending payment:", error);
        return res.status(500).json({
            success: false,
            message: 'Error checking payment status',
            error: error.message
        });
    }
};



export const getUserPlatformCharge = async (req, res) => {
    try {
        const { userId } = req.params; // Get userId from request params

        // Find the latest active charge
        let charge = await PlatformCharges.findOne({ userId, status: "active" }).sort({ createdAt: -1 });

        // If no active charge is found, get the latest expired charge
        if (!charge) {
            charge = await PlatformCharges.findOne({ userId, status: "expired" }).sort({ createdAt: -1 });
        }

        // If no charges found, return 404
        if (!charge) {
            return res.status(404).json({ message: 'No platform charges found for this user.' });
        }

        // Format startDate and endDate
        const processedCharge = {
            ...charge._doc, // Spread existing charge data
            startDate: charge.startDate ? new Date(charge.startDate) : null,
            endDate: charge.endDate ? new Date(charge.endDate) : null
        };

        res.status(200).json(processedCharge);
    } catch (error) {
        console.error('Error fetching platform charges:', error);
        res.status(500).json({ error: 'Failed to fetch platform charges' });
    }
};





export const createPlan = async (req, res) => {
    try {
        // Extract plan details from request body
        const {
            planName,
            price,
            validityDays,
            description,
            benefits
        } = req.body;

        // Validate required fields
        if (!planName || !price || !validityDays) {
            return res.status(400).json({
                success: false,
                message: 'Plan name, price, and validity days are required'
            });
        }

        // Additional validation
        if (price < 0) {
            return res.status(400).json({
                success: false,
                message: 'Price cannot be negative'
            });
        }

        if (validityDays <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Validity days must be greater than 0'
            });
        }

        // Check if plan with same name already exists
        const existingPlan = await MyPlan.findOne({ planName });
        if (existingPlan) {
            return res.status(400).json({
                success: false,
                message: 'A plan with this name already exists'
            });
        }

        // Create new plan
        const newPlan = new MyPlan({
            planName,
            price,
            validityDays,
            description,
            benefits: benefits || [] // Default to empty array if not provided
        });

        // Save the plan to database
        await newPlan.save();

        // Return success response
        return res.status(201).json({
            success: true,
            message: 'Plan created successfully',
            data: {
                id: newPlan._id,
                planName: newPlan.planName,
                price: newPlan.price,
                validityDays: newPlan.validityDays,
                description: newPlan.description,
                benefits: newPlan.benefits,
                createdAt: newPlan.createdAt
            }
        });

    } catch (error) {
        console.error("Error in createPlan:", error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create plan',
            error: error.message
        });
    }
};



export const getAllPlans = async (req, res) => {
    try {
        const plans = await MyPlan.find()
            .select('-__v') // Exclude version key
            .sort({ createdAt: -1 }); // Sort by newest first

        return res.status(200).json({
            success: true,
            message: 'Plans retrieved successfully',
            data: plans
        });
    } catch (error) {
        console.error("Error in getAllPlans:", error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve plans',
            error: error.message
        });
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