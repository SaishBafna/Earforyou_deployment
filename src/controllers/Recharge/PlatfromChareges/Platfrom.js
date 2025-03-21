import PlatformCharges from "../../../models/Wallet/PlatfromCharges/Platfrom.js";
import { createHash } from 'crypto'; // Correct import
import axios from 'axios';
import sha256 from "sha256";
import uniqid from "uniqid";
import User from "../../../models/Users.js";
import MyPlan from "../../../models/Wallet/PlatfromCharges/myPlanSchema.js";

export const buyPlanWithPayment = async (req, res) => {
    try {
        const { userId, planId } = req.body;

        // Step 1: Validate input
        console.log('Step 1 - Input Parameters:', { userId, planId });
        if (!userId || !planId) {
            console.log('Step 1 - Missing userId or planId');
            return res.status(400).json({
                success: false,
                message: 'User ID and Plan ID are required'
            });
        }

        // Step 2: Fetch user
        console.log('Step 2 - Fetching user with ID:', userId);
        const user = await User.findById(userId);
        console.log('Step 2 - User Found:', user ? { id: user._id, mobileNumber: user.mobileNumber } : 'Not found');
        if (!user) {
            console.log('Step 2 - User not found or no mobile number');
            return res.status(400).json({
                success: false,
                message: 'User not found or mobile number missing'
            });
        }

        // Step 3: Fetch subscription plan
        console.log('Step 3 - Fetching plan with ID:', planId);
        const plan = await MyPlan.findById(planId);
        console.log('Step 3 - Plan Found:', plan ? { id: plan._id, price: plan.price, validityDays: plan.validityDays } : 'Not found');
        if (!plan) {
            console.log('Step 3 - Plan not found');
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }

        // Step 4: Check for existing active plan
        console.log('Step 4 - Checking for active plan for user:', userId);
        const activePlan = await PlatformCharges.findOne({
            userId,
            status: 'active'
        }).sort({ endDate: -1 });
        console.log('Step 4 - Active Plan:', activePlan ? { id: activePlan._id, endDate: activePlan.endDate } : 'None');

        // Step 5: Generate unique transaction ID
        const merchantTransactionId = uniqid();
        console.log('Step 5 - Generated Transaction ID:', merchantTransactionId);

        // Step 6: Prepare payment payload
        const paymentPayload = {
            merchantId: process.env.MERCHANT_ID,
            merchantTransactionId: merchantTransactionId,
            merchantUserId: userId,
            amount: plan.price * 100, // Convert to paise
            redirectUrl: `${process.env.APP_BE_URL}/api/v1/validatePayment/${merchantTransactionId}/${userId}/${planId}`,
            redirectMode: "REDIRECT",
            mobileNumber: user.mobileNumber,
            paymentInstrument: { type: "PAY_PAGE" },
        };
        console.log('Step 6 - Payment Payload:', paymentPayload);
        console.log('Step 6 - Environment Variables:', {
            MERCHANT_ID: process.env.MERCHANT_ID,
            APP_BE_URL: process.env.APP_BE_URL,
            SALT_KEY: process.env.SALT_KEY ? '[REDACTED]' : 'undefined',
            SALT_INDEX: process.env.SALT_INDEX
        });

        // Step 7: Create base64 encoded payload and checksum
        const bufferObj = Buffer.from(JSON.stringify(paymentPayload), "utf8");
        const base64EncodedPayload = bufferObj.toString("base64");
        const stringToHash = base64EncodedPayload + "/pg/v1/pay" + process.env.SALT_KEY;
        const sha256Hash = sha256(stringToHash); // Ensure `sha256` is defined
        const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;
        console.log('Step 7 - Base64 Encoded Payload:', base64EncodedPayload);
        console.log('Step 7 - String to Hash:', stringToHash);
        console.log('Step 7 - SHA256 Hash:', sha256Hash);
        console.log('Step 7 - X-VERIFY Checksum:', xVerifyChecksum);

        // Step 8: Initiate payment
        console.log('Step 8 - Sending payment request to:', `${process.env.PHONE_PE_HOST_URL}/pg/v1/pay`);
        console.log('Step 8 - Request Headers:', {
            "Content-Type": "application/json",
            "X-VERIFY": xVerifyChecksum,
            "accept": "application/json"
        });
        const response = await axios.post(
            `${process.env.PHONE_PE_HOST_URL}/pg/v1/pay`,
            { request: base64EncodedPayload },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-VERIFY": xVerifyChecksum,
                    "accept": "application/json",
                },
            }
        );
        console.log('Step 8 - PhonePe Response:', response.data);

        // Step 9: Validate response
        if (!response.data.success || !response.data.data || !response.data.data.instrumentResponse) {
            console.log('Step 9 - Invalid PhonePe response:', response.data);
            throw new Error('Invalid response from PhonePe: ' + JSON.stringify(response.data));
        }

        // Step 10: Calculate dates and status
        let startDate, endDate, status;
        if (activePlan) {
            startDate = new Date(activePlan.endDate);
            endDate = new Date(startDate.getTime() + (plan.validityDays * 24 * 60 * 60 * 1000));
            status = 'queued';
        } else {
            startDate = new Date();
            endDate = new Date(startDate.getTime() + (plan.validityDays * 24 * 60 * 60 * 1000));
            status = 'pending';
        }
        console.log('Step 10 - Calculated Dates and Status:', { startDate, endDate, status });

        // Step 11: Save the new plan
        const newPlan = new PlatformCharges({
            userId,
            planName: plan.planName,
            amount: plan.price,
            startDate,
            endDate,
            status,
            transactionId: merchantTransactionId
        });
        await newPlan.save();
        console.log('Step 11 - Saved New Plan:', {
            id: newPlan._id,
            status: newPlan.status,
            transactionId: newPlan.transactionId
        });

        // Step 12: Send success response
        console.log('Step 12 - Preparing success response');
        return res.status(200).json({
            success: true,
            message: activePlan ?
                'Payment initiated and plan queued' :
                'Payment initiated and plan pending confirmation',
            paymentUrl: response.data.data.instrumentResponse.redirectInfo.url,
            planId: newPlan._id
        });

    } catch (error) {
        console.error('Step 13 - Error in buyPlanWithPayment:', {
            message: error.message,
            responseData: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });
        return res.status(500).json({
            success: false,
            message: 'Failed to initiate plan purchase',
            error: error.response?.data?.message || error.message
        });
    }
};


// Adjust model imports as needed

export const validatePayment = async (req, res) => {
    try {
        const { merchantTransactionId, userId, planId } = req.params;
        console.log("Step 1 - Validating payment with params:", { merchantTransactionId, userId, planId });

        if (!merchantTransactionId || !userId || !planId) {
            console.log("Step 1 - Missing required parameters");
            return res.status(400).json({ success: false, message: 'Missing required parameters' });
        }

        const existingTransaction = await PlatformCharges.findOne({ where: { transactionId: merchantTransactionId } });
        if (existingTransaction) {
            return res.status(400).json({ error: "Transaction with this ID already exists" });
        }

        // Get plan details
        const planDetails = await MyPlan.findById(planId);

        if (!planDetails) {
            console.log("Step 1.5 - Plan details not found for planId:", planId);
            return res.status(404).json({ success: false, message: 'Plan details not found' });
        }
        const validityDays = planDetails.validityDays;
        console.log("Step 1.5 - Found plan with validity days:", validityDays);

        // Create transaction entry
        await PlatformCharges.create({ transactionId: merchantTransactionId, userId, planId, status: 'pending' });

        // Construct the PhonePe status URL and checksum
        const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
        const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
        const sha256Hash = createHash('sha256').update(stringToHash).digest('hex');
        const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

        // Make request to PhonePe
        console.log("Step 4 - Making status request to PhonePe");
        const response = await axios.get(statusUrl, {
            headers: {
                "Content-Type": "application/json",
                "X-VERIFY": xVerifyChecksum,
                "X-MERCHANT-ID": process.env.MERCHANT_ID,
                "accept": "application/json",
            },
        });

        const responseData = response.data;
        console.log("Step 4 - PhonePe Payment Status Response:", responseData);

        if (responseData.code === "PAYMENT_SUCCESS" && responseData.data.state === "COMPLETED") {
            console.log("Step 5 - Payment successful, processing plan");

            const plan = await PlatformCharges.findOne({ transactionId: merchantTransactionId, userId });

            if (!plan) {
                console.log("Step 5 - Plan not found for transaction:", merchantTransactionId);
                return res.status(404).json({ success: false, message: 'Plan not found' });
            }

            console.log("Step 5 - Found plan:", { id: plan.id, status: plan.status });

            // Corrected query for last active or queued plan
            const lastPlan = await PlatformCharges.findOne({
                userId,
                status: { $in: ['active', 'queued', 'queued_confirmed'] }
            }).sort({ endDate: -1 });

            let now = new Date();
            let startDate = now;
            let endDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

            if (lastPlan) {
                console.log("Step 5 - Last plan found:", { id: lastPlan.id, status: lastPlan.status, endDate: lastPlan.endDate });

                if (['active', 'queued', 'queued_confirmed'].includes(lastPlan.status)) {
                    // If there's an active/queued plan, start new plan after the last one ends
                    startDate = new Date(lastPlan.endDate);
                    endDate = new Date(startDate.getTime() + validityDays * 24 * 60 * 60 * 1000);
                }
            }

            if (plan.status === 'pending') {
                // If there's already an active or queued plan, queue this plan
                if (lastPlan && lastPlan.status === 'active') {
                    plan.status = 'queued';
                } else {
                    plan.status = 'active';
                }
                plan.startDate = startDate;
                plan.endDate = endDate;
            } else if (plan.status === 'queued') {
                plan.status = 'queued_confirmed';
                plan.startDate = startDate;
                plan.endDate = endDate;
            }

            await plan.save();

            console.log("Step 5 - Plan updated successfully:", {
                id: plan.id, status: plan.status, startDate: plan.startDate, endDate: plan.endDate
            });

            return res.status(200).json({
                success: true,
                message: `Payment successful and plan ${plan.status === 'active' ? 'activated' : 'queued for activation'}`,
                data: {
                    planId: plan.id,
                    planName: planDetails.planName,
                    amount: planDetails.amount,
                    startDate: plan.startDate,
                    endDate: plan.endDate,
                    status: plan.status
                }
            });
        } else if (responseData.code === "PAYMENT_PENDING" || responseData.data.state === "PENDING") {
            console.log("Step 5 - Payment is still pending");
            return res.status(202).json({
                success: false,
                message: 'Payment is still pending. Please check again later.',
                data: responseData
            });
        } else {
            console.log("Step 5 - Payment failed:", responseData);
            return res.status(400).json({
                success: false,
                message: 'Payment validation failed',
                data: responseData
            });
        }

    } catch (error) {
        console.error("Step 6 - Error in validatePayment:", {
            message: error.message,
            responseData: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        return res.status(500).json({
            success: false,
            message: 'Payment validation failed',
            error: error.response?.data?.message || error.message
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