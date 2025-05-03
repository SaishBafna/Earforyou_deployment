import PlatformCharges from "../../../models/Wallet/PlatfromCharges/Platfrom.js";
import { createHash } from 'crypto'; // Correct import
import axios from 'axios';
import sha256 from "sha256";
import uniqid from "uniqid";
import User from "../../../models/Users.js";
import MyPlan from "../../../models/Wallet/PlatfromCharges/myPlanSchema.js";
import admin from 'firebase-admin';
import { validateAndApplyCoupon, recordCouponTransaction } from "../../../utils/couponHelper.js";



// Adjust model imports as needed

// export const validatePayment = async (req, res) => {
//     let transaction;
//     const { merchantTransactionId, userId, planId } = req.params;

//     try {
//         console.log("Step 1 - Validating payment with params:", { merchantTransactionId, userId, planId });

//         // Validate input parameters
//         if (!merchantTransactionId || !userId || !planId) {
//             console.log("Step 1 - Missing required parameters");
//             return res.status(400).json({ success: false, message: 'Missing required parameters' });
//         }

//         // Check for existing transaction
//         const existingTransaction = await PlatformCharges.findOne({ where: { transactionId: merchantTransactionId } });
//         if (existingTransaction) {
//             console.log("Transaction already exists:", existingTransaction.status);
//             return res.status(400).json({
//                 success: false,
//                 error: "Transaction with this ID already exists",
//                 currentStatus: existingTransaction.status
//             });
//         }

//         // Get plan details
//         const planDetails = await MyPlan.findById(planId);
//         if (!planDetails) {
//             console.log("Step 1.5 - Plan details not found for planId:", planId);
//             return res.status(404).json({ success: false, message: 'Plan details not found' });
//         }

//         const validityDays = planDetails.validityDays;
//         console.log("Step 1.5 - Found plan with validity days:", validityDays);

//         // Create pending transaction entry first
//         transaction = await PlatformCharges.create({
//             transactionId: merchantTransactionId,
//             userId,
//             planId,
//             status: 'processing', // Start with processing status
//             amount: planDetails.amount,
//             planName: planDetails.planName
//         });
//         console.log("Step 2 - Created processing transaction:", transaction.id);

//         // Construct the PhonePe status URL and checksum
//         const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
//         const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
//         const sha256Hash = createHash('sha256').update(stringToHash).digest('hex');
//         const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

//         // Make request to PhonePe
//         console.log("Step 3 - Making status request to PhonePe");
//         const response = await axios.get(statusUrl, {
//             headers: {
//                 "Content-Type": "application/json",
//                 "X-VERIFY": xVerifyChecksum,
//                 "X-MERCHANT-ID": process.env.MERCHANT_ID,
//                 "accept": "application/json",
//             },
//             timeout: 10000 // 10 seconds timeout
//         });

//         const responseData = response.data;
//         console.log("Step 4 - PhonePe Payment Status Response:", responseData);

//         if (!responseData.success || !responseData.data) {
//             throw new Error("Invalid response from payment gateway");
//         }

//         const paymentState = responseData.data.state;
//         const paymentCode = responseData.code;

//         // Handle different payment states
//         switch (paymentState) {
//             case 'COMPLETED':
//                 if (paymentCode === "PAYMENT_SUCCESS") {
//                     console.log("Step 5 - Payment successful, processing plan");

//                     const lastPlan = await PlatformCharges.findOne({
//                         userId,
//                         status: { $in: ['active', 'queued', 'queued_confirmed'] }
//                     }).sort({ endDate: -1 });

//                     let now = new Date();
//                     let startDate = now;
//                     let endDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
//                     console.log("Step 5 - Start and End Dates:", { startDate, endDate });
//                     if (lastPlan) {
//                         console.log("Step 5 - Last plan found:", {
//                             id: lastPlan.id,
//                             status: lastPlan.status,
//                             endDate: lastPlan.endDate
//                         });

//                         if (['active', 'queued', 'queued_confirmed'].includes(lastPlan.status)) {
//                             startDate = new Date(lastPlan.endDate);
//                             endDate = new Date(startDate.getTime() + validityDays * 24 * 60 * 60 * 1000);
//                         }
//                     }

//                     // Update transaction status based on existing plans
//                     if (lastPlan && lastPlan.status === 'active') {
//                         transaction.status = 'queued';
//                         const title = `Your ${planDetails.validityDays}-Day Plan is Queued ⏳`;
//                         const message = `Your subscription will be activated soon. You will have access to the platform for ${planDetails.validityDays} days. Stay tuned! 🚀`;
//                         const screen = 'dashboard';
//                         await sendNotification(userId, title, message, screen);
//                     } else {
//                         transaction.status = 'active';
//                         const title = `${planDetails.validityDays} Days Plan Activated! �`;
//                         const message = `You can use the platform for ${planDetails.validityDays} days. Enjoy your experience! 🚀`;
//                         const screen = 'dashboard';
//                         await sendNotification(userId, title, message, screen);
//                     }

//                     transaction.startDate = startDate;
//                     transaction.endDate = endDate;
//                     transaction.paymentResponse = responseData;
//                     await transaction.save();

//                     console.log("Step 5 - Plan updated successfully:", {
//                         id: transaction.id,
//                         status: transaction.status,
//                         startDate: transaction.startDate,
//                         endDate: transaction.endDate
//                     });

//                     return res.status(200).json({
//                         success: true,
//                         message: `Payment successful and plan ${transaction.status === 'active' ? 'activated' : 'queued for activation'}`,
//                         data: {
//                             planId: transaction.id,
//                             planName: planDetails.planName,
//                             amount: planDetails.amount,
//                             startDate: transaction.startDate,
//                             endDate: transaction.endDate,
//                             status: transaction.status
//                         }
//                     });
//                 }
//                 break;

//             case 'PENDING':
//                 console.log("Step 5 - Payment is still pending");
//                 // Update transaction to pending status
//                 transaction.status = 'pending';
//                 transaction.paymentResponse = responseData;
//                 await transaction.save();

//                 const title = `Your ${planDetails.validityDays}-Day Plan is pending ⏳`;
//                 const message = `Payment is still pending. Please check again later`;
//                 await sendNotification(userId, title, message);

//                 return res.status(202).json({
//                     success: false,
//                     message: 'Payment is still pending. Please check again later.',
//                     data: responseData,
//                     transactionId: transaction.id
//                 });

//             default:
//                 // Payment failed or other status
//                 console.log("Step 5 - Payment failed:", responseData);
//                 transaction.status = 'failed';
//                 transaction.paymentResponse = responseData;
//                 transaction.error = responseData.message || 'Payment failed';
//                 await transaction.save();

//                 const failTitle = `Payment Failed ❌`;
//                 const failMessage = `We encountered a network issue while processing your payment. If the amount was deducted, please contact support for a refund. 🔄`;
//                 await sendNotification(userId, failTitle, failMessage);

//                 return res.status(400).json({
//                     success: false,
//                     message: 'Payment validation failed',
//                     data: responseData,
//                     transactionId: transaction.id
//                 });
//         }

//     } catch (error) {
//         console.error("Step 6 - Error in validatePayment:", {
//             message: error.message,
//             stack: error.stack,
//             responseData: error.response?.data,
//             status: error.response?.status
//         });

//         // Update transaction with error if it was created
//         if (transaction) {
//             transaction.status = 'failed';
//             transaction.error = error.message;
//             if (error.response?.data) {
//                 transaction.paymentResponse = error.response.data;
//             }
//             await transaction.save();
//         }

//         const title = `Payment Processing Error`;
//         const message = `We encountered an issue while processing your payment. Our team has been notified. Please check back later.`;
//         const screen = 'Wallet_detail';
//         await sendNotification(userId, title, message, screen);

//         return res.status(500).json({
//             success: false,
//             message: 'Payment validation failed',
//             error: error.response?.data?.message || error.message,
//             transactionId: transaction?.id
//         });
//     }
// };



export const validatePayment = async (req, res) => {
    let transaction;
    const { merchantTransactionId, userId, planId, couponCode } = req.query;

    try {
        console.log("Step 1 - Validating payment with params:", { merchantTransactionId, userId, planId, couponCode });

        // Validate input parameters
        if (!merchantTransactionId || !userId || !planId) {
            console.log("Step 1 - Missing required parameters");
            return res.status(400).json({ success: false, message: 'Missing required parameters' });
        }

        // Check for existing transaction
        const existingTransaction = await PlatformCharges.findOne({ where: { transactionId: merchantTransactionId } });
        if (existingTransaction) {
            console.log("Transaction already exists:", existingTransaction.status);
            return res.status(400).json({
                success: false,
                error: "Transaction with this ID already exists",
                currentStatus: existingTransaction.status
            });
        }

        // Get user and plan details
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const planDetails = await MyPlan.findById(planId);
        if (!planDetails) {
            console.log("Step 1.5 - Plan details not found for planId:", planId);
            return res.status(404).json({ success: false, message: 'Plan details not found' });
        }

        let originalAmount = planDetails.amount;
        let finalAmount = originalAmount;
        let discountAmount = 0;
        let extraValidityDays = 0;
        let coupon = null;
        let couponApplied = false;

        // Apply coupon if provided
        if (couponCode) {
            try {
                const couponResult = await validateAndApplyCoupon(
                    couponCode,
                    userId,
                    originalAmount,
                );

                if (couponResult.isValid) {
                    coupon = couponResult.coupon;
                    finalAmount = couponResult.finalAmount;
                    discountAmount = couponResult.discountAmount;
                    extraValidityDays = couponResult.freeDays || 0;
                    couponApplied = true;

                    console.log("Coupon applied successfully:", {
                        code: coupon.code,
                        discountAmount,
                        extraValidityDays
                    });
                }
            } catch (couponError) {
                console.log("Coupon application failed:", couponError.message);
                // Continue without coupon if there's an error
            }
        }

        // Create pending transaction entry first
        transaction = await PlatformCharges.create({
            transactionId: merchantTransactionId,
            userId,
            planId,
            status: 'processing',
            originalAmount,
            amount: finalAmount,
            planName: planDetails.planName,
            couponDetails: couponApplied ? {
                applied: true,
                code: coupon.code,
                couponId: coupon._id,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                discountAmount,
                extraValidityDays
            } : {
                applied: false
            }
        });
        console.log("Step 2 - Created processing transaction:", transaction.id);

        // Construct the PhonePe status URL and checksum
        const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
        const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
        const sha256Hash = createHash('sha256').update(stringToHash).digest('hex');
        const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

        // Make request to PhonePe
        console.log("Step 3 - Making status request to PhonePe");
        const response = await axios.get(statusUrl, {
            headers: {
                "Content-Type": "application/json",
                "X-VERIFY": xVerifyChecksum,
                "X-MERCHANT-ID": process.env.MERCHANT_ID,
                "accept": "application/json",
            },
            timeout: 10000 // 10 seconds timeout
        });

        const responseData = response.data;
        console.log("Step 4 - PhonePe Payment Status Response:", responseData);

        if (!responseData.success || !responseData.data) {
            throw new Error("Invalid response from payment gateway");
        }

        const paymentState = responseData.data.state;
        const paymentCode = responseData.code;
        const paidAmount = responseData.data.amount ? responseData.data.amount / 100 : 0;

        // Validate paid amount matches expected amount (after coupon discount)
        if (paymentState === 'COMPLETED' && paidAmount !== finalAmount) {
            throw new Error(`Paid amount (₹${paidAmount}) doesn't match expected amount (₹${finalAmount})`);
        }

        // Calculate validity days (original + extra from coupon)
        const totalValidityDays = planDetails.validityDays + extraValidityDays;
        console.log("Total validity days:", totalValidityDays, "(Original:", planDetails.validityDays, "+ Extra:", extraValidityDays, ")");

        // Handle different payment states
        switch (paymentState) {
            case 'COMPLETED':
                if (paymentCode === "PAYMENT_SUCCESS") {
                    console.log("Step 5 - Payment successful, processing plan");

                    const lastPlan = await PlatformCharges.findOne({
                        userId,
                        status: { $in: ['active', 'queued', 'queued_confirmed'] }
                    }).sort({ endDate: -1 });

                    let now = new Date();
                    let startDate = now;
                    let endDate = new Date(now.getTime() + totalValidityDays * 24 * 60 * 60 * 1000);

                    console.log("Step 5 - Start and End Dates:", { startDate, endDate });
                    if (lastPlan) {
                        console.log("Step 5 - Last plan found:", {
                            id: lastPlan.id,
                            status: lastPlan.status,
                            endDate: lastPlan.endDate
                        });

                        if (['active', 'queued', 'queued_confirmed'].includes(lastPlan.status)) {
                            startDate = new Date(lastPlan.endDate);
                            endDate = new Date(startDate.getTime() + totalValidityDays * 24 * 60 * 60 * 1000);
                        }
                    }

                    // Update transaction status based on existing plans
                    if (lastPlan && lastPlan.status === 'active') {
                        transaction.status = 'queued';
                        const title = `Your ${totalValidityDays}-Day Plan is Queued ⏳`;
                        const message = `Your subscription will be activated soon. You will have access to the platform for ${totalValidityDays} days. Stay tuned! 🚀`;
                        const screen = 'dashboard';
                        await sendNotification(userId, title, message, screen);
                    } else {
                        transaction.status = 'active';
                        const title = `${totalValidityDays} Days Plan Activated! ✅`;
                        const message = `You can use the platform for ${totalValidityDays} days. Enjoy your experience! 🚀`;
                        const screen = 'dashboard';
                        await sendNotification(userId, title, message, screen);
                    }

                    transaction.startDate = startDate;
                    transaction.endDate = endDate;
                    transaction.paymentResponse = responseData;
                    await transaction.save();

                    // Record coupon usage if applied
                    if (couponApplied && coupon) {
                        await recordCouponTransaction(
                            coupon._id,
                            userId,
                            merchantTransactionId,
                            discountAmount
                        );
                        console.log("Coupon usage recorded successfully");
                    }

                    console.log("Step 5 - Plan updated successfully:", {
                        id: transaction.id,
                        status: transaction.status,
                        startDate: transaction.startDate,
                        endDate: transaction.endDate
                    });

                    return res.status(200).json({
                        success: true,
                        message: `Payment successful and plan ${transaction.status === 'active' ? 'activated' : 'queued for activation'}`,
                        data: {
                            planId: transaction.id,
                            planName: planDetails.planName,
                            originalAmount,
                            amount: finalAmount,
                            discountAmount,
                            couponApplied,
                            startDate: transaction.startDate,
                            endDate: transaction.endDate,
                            status: transaction.status,
                            totalValidityDays,
                            extraValidityDays
                        }
                    });
                }
                break;

            case 'PENDING':
                console.log("Step 5 - Payment is still pending");
                transaction.status = 'pending';
                transaction.paymentResponse = responseData;
                await transaction.save();

                const title = `Your ${totalValidityDays}-Day Plan is pending ⏳`;
                const message = `Payment is still pending. You'll get ${extraValidityDays > 0 ? `${extraValidityDays} extra days ` : ''}when completed`;
                await sendNotification(userId, title, message);

                return res.status(202).json({
                    success: false,
                    message: 'Payment is still pending. Please check again later.',
                    data: responseData,
                    transactionId: transaction.id,
                    couponApplied,
                    potentialExtraDays: extraValidityDays
                });

            default:
                console.log("Step 5 - Payment failed:", responseData);
                transaction.status = 'failed';
                transaction.paymentResponse = responseData;
                transaction.error = responseData.message || 'Payment failed';
                await transaction.save();

                const failTitle = `Payment Failed ❌`;
                const failMessage = `We encountered a network issue while processing your payment. If the amount was deducted, please contact support for a refund. 🔄`;
                await sendNotification(userId, failTitle, failMessage);

                return res.status(400).json({
                    success: false,
                    message: 'Payment validation failed',
                    data: responseData,
                    transactionId: transaction.id
                });
        }

    } catch (error) {
        console.error("Step 6 - Error in validatePayment:", {
            message: error.message,
            stack: error.stack,
            responseData: error.response?.data,
            status: error.response?.status
        });

        if (transaction) {
            transaction.status = 'failed';
            transaction.error = error.message;
            if (error.response?.data) {
                transaction.paymentResponse = error.response.data;
            }
            await transaction.save();
        }

        const title = `Payment Processing Error`;
        const message = `We encountered an issue while processing your payment. Our team has been notified. Please check back later.`;
        const screen = 'Wallet_detail';
        await sendNotification(userId, title, message, screen);

        return res.status(500).json({
            success: false,
            message: 'Payment validation failed',
            error: error.response?.data?.message || error.message,
            transactionId: transaction?.id
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