import axios from 'axios';
import crypto from 'crypto';
import Wallet from '../../models/Wallet/Wallet.js';
import User from '../../models/Users.js'
import sha256 from "sha256";
import uniqid from "uniqid";
import admin from 'firebase-admin';
import firebaseConfig from '../../config/firebaseConfig.js';
import SubscriptionPlan from '../../models/Subscription/Subscription.js';
import EarningWallet from '../../models/Wallet/EarningWallet.js';
import mongoose from 'mongoose'; // If using ES modules
import PendingTransaction from '../../models/PendingTransaction.js';
import { verifyWebhookSignature } from '../../utilities/paymentUtils.js';


// Function to process payments asynchronously
const processPayment = async (merchantTransactionId, code, paymentData) => {
  try {
    // Find the pending transaction in our database
    const pendingTxn = await PendingTransaction.findOne({ merchantTransactionId });
    if (!pendingTxn) {
      console.error(`No pending transaction found for ID: ${merchantTransactionId}`);
      return;
    }

    // Update pending transaction with response data
    pendingTxn.responseData = paymentData;

    const { userId, planId } = pendingTxn;

    // Process payment based on status
    if (code === "PAYMENT_SUCCESS" && paymentData.state === "COMPLETED") {
      const { amount } = paymentData;

      // Use transaction to ensure atomicity
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Fetch the subscription plan
        const plan = await SubscriptionPlan.findById(planId).session(session);
        if (!plan) {
          throw new Error("Invalid plan ID");
        }

        const { price, talkTime } = plan;

        // Get or create wallet
        let wallet = await Wallet.findOne({ userId }).session(session);
        if (!wallet) {
          wallet = await Wallet.create([{
            userId,
            balance: 0,
            currency: 'inr',
            recharges: [],
            deductions: [],
            plan: [],
            lastUpdated: new Date()
          }], { session });
          wallet = wallet[0];
        }

        // Create recharge record
        const newRecharge = {
          amount: amount / 100,
          merchantTransactionId,
          state: paymentData.state || 'COMPLETED',
          responseCode: code,
          rechargeMethod: "PhonePe",
          rechargeDate: new Date(),
          transactionId: merchantTransactionId,
        };

        // Update wallet
        const newBalance = wallet.balance + talkTime;
        wallet.balance = newBalance;
        wallet.talkTime = (wallet.talkTime || 0) + talkTime;
        wallet.recharges.push(newRecharge);
        wallet.lastUpdated = new Date();

        await wallet.save({ session });

        // Update the pending transaction
        pendingTxn.status = 'COMPLETED';
        pendingTxn.processed = true;
        pendingTxn.processedAt = new Date();
        await pendingTxn.save({ session });

        // Commit the transaction
        await session.commitTransaction();

        // Send notification
        await sendNotification(userId, "Payment Successful",
          `Your wallet has been credited with ₹${amount / 100}. New balance: ₹${wallet.balance}. You have been credited with ${talkTime} minutes of talk time.`);

        console.log(`Payment processed successfully for transaction: ${merchantTransactionId}`);
      } catch (error) {
        // Rollback in case of error
        await session.abortTransaction();
        console.error("Error processing successful payment:", error);

        // Update pending transaction to show there was an error
        pendingTxn.status = 'FAILED';
        pendingTxn.failureReason = error.message;
        await pendingTxn.save();
      } finally {
        session.endSession();
      }
    } else {
      // Record failed payment
      pendingTxn.status = 'FAILED';
      pendingTxn.processed = true;
      pendingTxn.processedAt = new Date();
      pendingTxn.failureReason = paymentData.state || code;
      await pendingTxn.save();

      // Send failure notification
      await sendNotification(userId, "Payment failed",
        `Your payment failed. Transaction ID: ${merchantTransactionId}.`);

      console.log(`Payment failed for transaction: ${merchantTransactionId}, reason: ${paymentData.state || code}`);
    }
  } catch (error) {
    console.error("Error in payment processing:", error);
  }
};



export const initiatePayment = async (req, res) => {
  try {
    const { userId, planId } = req.body;

    if (!planId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Plan ID are required'
      });
    }

    // Fetch the subscription plan by ID
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    const { price, talkTime } = plan;

    if (price < 100) {
      await logTransaction(transactionId, 'VALIDATION_FAILED', new Error('Amount below minimum'));
      return res.status(400).json({
        success: false,
        message: 'Minimum recharge amount is 100'
      });
    }

    // Generate a unique merchant transaction ID
    const merchantTransactionId = uniqid();

    // Fetch user to get the mobile number (optional)
    const user = await User.findById(userId);
    if (!user || !user.mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'User not found or mobile number is missing'
      });
    }

    const normalPayLoad = {
      merchantId: process.env.MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: userId,
      amount: price * 100, // Convert to paise
      redirectUrl: `${process.env.APP_BE_URL}/api/v1/validate/${merchantTransactionId}/${userId}`,
      redirectMode: "REDIRECT",
      mobileNumber: user.mobileNumber, // Use actual mobile number
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const bufferObj = Buffer.from(JSON.stringify(normalPayLoad), "utf8");
    const base64EncodedPayload = bufferObj.toString("base64");

    const stringToHash = base64EncodedPayload + "/pg/v1/pay" + process.env.SALT_KEY;
    const sha256Hash = sha256(stringToHash);
    const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

    const response = await axios.post(
      `${process.env.PHONE_PE_HOST_URL}/pg/v1/pay`,
      { request: base64EncodedPayload },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerifyChecksum,
          accept: "application/json",
        },
      }
    );

    return res.status(200).json({
      success: true,
      paymentUrl: response.data.data.instrumentResponse.redirectInfo.url
    });
  } catch (error) {
    console.error("Error in payment initiation:", error);
    return res.status(500).send({ error: "Payment initiation failed" });
  }
};


// Step 2: PhonePe Webhook handler for asynchronous payment processing
export const phonepeWebhook = async (req, res) => {
  // Verify the webhook signature from PhonePe
  const signature = req.headers['x-verify'];
  const payload = req.body;

  // Security check
  if (!signature || !verifyWebhookSignature(payload, signature, process.env.SALT_KEY, process.env.SALT_INDEX)) {
    console.error("Invalid webhook signature");
    return res.status(401).send({ status: "INVALID_SIGNATURE" });
  }

  // Immediately acknowledge receipt to PhonePe to prevent retries
  res.status(200).send({ status: "RECEIVED" });

  // Extract the necessary data
  const { merchantTransactionId, code, data } = payload;

  // Process the payment asynchronously
  try {
    processPayment(merchantTransactionId, code, data);
  } catch (error) {
    console.error("Error queuing payment processing:", error);
    // We've already sent a response, so just log the error
  }
};

// Step 4: Payment status check endpoint for client applications
export const checkPaymentStatus = async (req, res) => {
  const { merchantTransactionId } = req.params;

  if (!merchantTransactionId) {
    return res.status(400).send({ success: false, message: "Transaction ID is required" });
  }

  try {
    // Check local records first
    const pendingTxn = await PendingTransaction.findOne({ merchantTransactionId });

    if (!pendingTxn) {
      return res.status(404).send({ success: false, message: "Transaction not found" });
    }

    // If transaction is already processed, return the status
    if (pendingTxn.processed) {
      // If successful, get wallet details
      if (pendingTxn.status === 'COMPLETED') {
        const wallet = await Wallet.findOne({ userId: pendingTxn.userId });

        return res.status(200).send({
          success: true,
          status: pendingTxn.status,
          processedAt: pendingTxn.processedAt,
          walletBalance: wallet ? wallet.balance : null,
          talkTime: wallet ? wallet.talkTime : null
        });
      }

      // Return failed status
      return res.status(200).send({
        success: true,
        status: pendingTxn.status,
        failureReason: pendingTxn.failureReason || "Unknown error",
        processedAt: pendingTxn.processedAt
      });
    }

    // If not processed yet, check with PhonePe
    const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
    const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
    const sha256Hash = sha256(stringToHash);
    const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

    const response = await axios.get(statusUrl, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": xVerifyChecksum,
        "X-MERCHANT-ID": process.env.MERCHANT_ID,
        "accept": "application/json",
      },
    });

    // If payment is successful but not processed in our system yet
    if (response.data && response.data.code === "PAYMENT_SUCCESS" && response.data.data.state === "COMPLETED") {
      // Process the payment asynchronously
      processPayment(merchantTransactionId, response.data.code, response.data.data);

      // Return pending status since processing hasn't completed yet
      return res.status(200).send({
        success: true,
        status: "PROCESSING",
        message: "Payment confirmed with gateway. Processing wallet update."
      });
    }

    // Return the PhonePe status
    return res.status(200).send({
      success: true,
      status: "PENDING",
      phonepeStatus: response.data.data.state,
      message: "Payment is being processed"
    });
  } catch (error) {
    console.error("Error checking payment status:", error);
    return res.status(500).send({ success: false, message: "Error checking payment status", error: error.message });
  }
};

// Step 5: Client callback endpoint - called when user is redirected back from PhonePe
export const paymentCallback = async (req, res) => {
  const { merchantTransactionId } = req.query;

  try {
    // Find the transaction
    const pendingTxn = await PendingTransaction.findOne({ merchantTransactionId });

    if (!pendingTxn) {
      return res.status(404).send("Transaction not found");
    }

    // Check if transaction is already processed
    if (pendingTxn.processed) {
      if (pendingTxn.status === 'COMPLETED') {
        return res.redirect(`/payment/success?txnId=${merchantTransactionId}`);
      } else {
        return res.redirect(`/payment/failure?txnId=${merchantTransactionId}&reason=${pendingTxn.failureReason || 'Unknown error'}`);
      }
    }

    // If not processed yet, check status from PhonePe
    const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
    const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
    const sha256Hash = sha256(stringToHash);
    const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

    const response = await axios.get(statusUrl, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": xVerifyChecksum,
        "X-MERCHANT-ID": process.env.MERCHANT_ID,
        "accept": "application/json",
      },
    });

    // If payment is successful, process it
    if (response.data && response.data.code === "PAYMENT_SUCCESS" && response.data.data.state === "COMPLETED") {
      // Process payment asynchronously
      processPayment(merchantTransactionId, response.data.code, response.data.data);

      // Redirect to success page
      return res.redirect(`/payment/success?txnId=${merchantTransactionId}`);
    } else {
      // Update transaction status
      pendingTxn.status = 'FAILED';
      pendingTxn.processed = true;
      pendingTxn.processedAt = new Date();
      pendingTxn.failureReason = response.data.data?.state || response.data.code;
      await pendingTxn.save();

      // Redirect to failure page
      return res.redirect(`/payment/failure?txnId=${merchantTransactionId}&reason=${response.data.data?.state || 'Payment failed'}`);
    }
  } catch (error) {
    console.error("Error in payment callback:", error);
    return res.redirect(`/payment/failure?txnId=${merchantTransactionId}&reason=server_error`);
  }
};

// Step 6: Original validatePayment function - improved for resilience

export const validatePayment = async (req, res) => {
  const { merchantTransactionId, userId, planId } = req.body;

  if (!merchantTransactionId || !userId) {
    return res.status(400).send({ success: false, message: "Invalid transaction ID or user ID" });
  }

  try {
    // First check if payment is already processed
    const pendingTxn = await PendingTransaction.findOne({ merchantTransactionId });

    if (pendingTxn) {
      if (pendingTxn.processed) {
        if (pendingTxn.status === 'COMPLETED') {
          const wallet = await Wallet.findOne({ userId });

          return res.status(200).send({
            success: true,
            message: "Payment already processed",
            data: {
              balance: wallet.balance,
              talkTime: wallet.talkTime,
              transaction: wallet.recharges.find(r => r.merchantTransactionId === merchantTransactionId)
            }
          });
        } else {
          return res.status(400).send({
            success: false,
            message: "Payment already processed but failed",
            failureReason: pendingTxn.failureReason
          });
        }
      }
    } else {
      // Create a pending transaction if one doesn't exist
      await PendingTransaction.create({
        merchantTransactionId,
        userId,
        planId,
        createdAt: new Date(),
        status: 'PENDING'
      });
    }

    // Check payment status with PhonePe
    const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
    const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
    const sha256Hash = sha256(stringToHash);
    const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

    // Return early with an acknowledgment
    res.status(202).send({
      success: true,
      message: "Payment validation in progress",
    });

    // Continue processing asynchronously
    const response = await axios.get(statusUrl, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": xVerifyChecksum,
        "X-MERCHANT-ID": process.env.MERCHANT_ID,
        "accept": "application/json",
      },
    });

    console.log("PhonePe response:", response.data);

    // Process the payment asynchronously
    processPayment(merchantTransactionId, response.data.code, response.data.data);

  } catch (error) {
    console.error("Error in payment validation:", error);

    // If response was already sent, don't try to send again
    if (!res.headersSent) {
      return res.status(500).send({ success: false, message: "Payment validation failed", error: error.message });
    }
  }
};






export const getRechargeHistory = async (req, res) => {
  try {
    const { userId } = req.params; // Assuming userId is passed as a route parameter

    // Find the wallet for the specified userId
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found for this user",
      });
    }
    const rechargeHistory = wallet.recharges.slice(-20); // Fetch the most recent 20 recharges

    // Return the recharges array from the wallet
    return res.status(200).json({
      success: true,
      message: "Recharge history retrieved successfully",
      data: rechargeHistory,
      balance: wallet.balance,
    });
  } catch (error) {
    console.error("Error retrieving recharge history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve recharge history",
      error: error.message,
    });
  }
};


//get Erraning Wallet 
export const getEarningHistory = async (req, res) => {
  try {
    const { userId } = req.params; // Assuming userId is passed as a route parameter

    // Find the wallet for the specified userId
    const earning = await EarningWallet.findOne({ userId });

    if (!earning) {
      return res.status(404).json({
        success: false,
        message: "earning not found for this user",
      });
    }
    const earningHistory = earning.earnings.slice(-20); // Fetch the most recent 20 recharges

    // Return the recharges array from the earning
    return res.status(200).json({
      success: true,
      message: "Recharge history retrieved successfully",
      data: earningHistory,
      balance: earning.balance,
    });
  } catch (error) {
    console.error("Error retrieving recharge history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve recharge history",
      error: error.message,
    });
  }
};




export const getAllPlans = async (req, res) => {
  try {
    // Fetch all plans
    const plans = await SubscriptionPlan.find();

    if (!plans || plans.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No subscription plans found",
      });
    }

    // Respond with the fetched plans
    return res.status(200).json({
      success: true,
      message: "Subscription plans retrieved successfully",
      data: plans,
    });
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch subscription plans",
      error: error.message,
    });
  }
};








export const transferEarningsToWallet = async (req, res) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user._id;
    const { amount } = req.body;

    // Validate input
    if (!userId || !amount || amount <= 0) {

      return res.status(400).json({
        success: false,
        message: 'Invalid transfer parameters'
      });
    }

    // Find earning wallet
    const earningWallet = await EarningWallet.findOne({ userId }).session(session);
    if (!earningWallet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Earning wallet not found'
      });
    }

    // Check if sufficient balance exists
    if (earningWallet.balance < amount) {
      await session.abortTransaction();
      session.endSession();

      const title = "Insufficient earnings balance"
      const message = `Your Blance is Low`
      await sendNotification(userId, title, message)

      return res.status(400).json({
        success: false,
        message: 'Insufficient earnings balance'
      });
    }

    // Find or create main wallet
    let wallet = await Wallet.findOne({ userId }).session(session);



    if (!wallet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Wallet Not found'
      });
    }

    // Add transfer to earning wallet deductions
    earningWallet.deductions.push({
      amount,
      reason: 'wallet_transfer',
      createdAt: new Date()
    });

    const newBalance = wallet.balance + amount;
    // const days=wallet.isvalidityDays+validityDays;
    console.log("newBalance", newBalance)
    wallet.balance = newBalance;

    // Add transfer to main wallet recharges
    wallet.recharges.push({
      amount,
      merchantTransactionId: `EARNINGS_TRANSFER_${Date.now()}`,
      state: 'completed',
      responseCode: '200',
      rechargeMethod: 'INTERNAL',
      transactionId: `EARNINGS_TRANSFER_${Date.now()}`,
      rechargeDate: new Date()
    });

    // Save both wallets
    await earningWallet.save({ session });
    await wallet.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    const title = "Balance transferred successfully"
    const message = `Balance Added in Calling Wallet ${amount}`
    await sendNotification(userId, title, message)


    return res.status(200).json({
      success: true,
      message: 'Balance transferred successfully',
      transferredAmount: amount,
      newEarningsBalance: earningWallet.balance,
      newWalletBalance: wallet.balance
    });

  } catch (error) {
    // Rollback transaction in case of error
    await session.abortTransaction();
    session.endSession();

    console.error('Transfer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during transfer',
      error: error.message
    });
  }
};





async function sendNotification(userId, title, message) {
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
    token: deviceToken,
  };

  try {
    const response = await admin.messaging().send(payload);
    console.log("Notification sent successfully:", response);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}



