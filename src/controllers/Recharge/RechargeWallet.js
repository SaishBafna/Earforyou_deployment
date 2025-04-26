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

   console.log("price", price)
    // Check if the user has a wallet

    // Generate a unique merchant transaction ID
    const merchantTransactionId = uniqid();

    // Fetch user to get the mobile number (optional)
    const user = await User.findById(userId);
    if (!user ) {
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
      redirectUrl: 'com.earforall://payment',
      redirectMode: 'POST',
      
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

// export const validatePayment = async (req, res) => {
//   const { merchantTransactionId, userId ,planId} = req.body;

//   if (!merchantTransactionId || !userId) {
//     return res.status(400).send("Invalid transaction ID or user ID");
//   }

//   try {
//     const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
//     const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
//     const sha256Hash = sha256(stringToHash);
//     const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

//     const response = await axios.get(statusUrl, {
//       headers: {
//         "Content-Type": "application/json",
//         "X-VERIFY": xVerifyChecksum,
//         "X-MERCHANT-ID":process.env.MERCHANT_ID,
//         accept: "application/json",
//       },
//     });

//     console.log("response",response.data.data.state);
//     console.log("response1",response.data);

//     if (response.data && response.data.code === "PAYMENT_SUCCESS" && response.data.data.state === "COMPLETED") {

//       const { amount } = response.data.data;
//       // const planId = response.data.data.planId; // Assuming planId is returned in response

//       // Fetch the subscription plan
//       const plan = await SubscriptionPlan.findById(planId);
//       if (!plan) {
//         return res.status(400).send("Invalid plan ID");
//       }

//       const { price, talkTime } = plan;

//       let wallet = await Wallet.findOne({ userId });
//       if (!wallet) {
//         wallet = await Wallet.create({
//           userId,
//           balance: 0,
//           currency: 'inr',
//           recharges: [],
//           deductions: [],
//           plan:[],
//           lastUpdated: new Date()
//         });
//       }

//       const newRecharge = {
//         amount: amount / 100, 
//         merchantTransactionId,
//         state: response.data.data.state || 'COMPLETED',
//         responseCode: response.data.code,
//         rechargeMethod: "PhonePe",
//         rechargeDate: new Date(),
//         transactionId: merchantTransactionId,

//         // validityDays:validityDays,
//       };

//       const newBalance = wallet.balance + talkTime;
//       // const days=wallet.isvalidityDays+validityDays;
//       console.log("newBalance",newBalance)
//       wallet.balance = newBalance;
//       // wallet.isvalidityDays=days
//       wallet.recharges.push(newRecharge);

//       // Update the wallet balance and talk time
//       wallet.talkTime = (wallet.talkTime || 0) + talkTime; // Add the talk time from the plan
//       await wallet.save();

//       // Send notification about successful payment
//       await sendNotification(userId, "Payment Successful", `Your wallet has been credited with ₹${newRecharge.amount}. New balance: ₹${wallet.balance}. You have been credited with ${talkTime} minutes of talk time.`);

//       return res.status(200).send({
//         success: true,
//         message: "Payment validated and wallet updated",
//         data: { balance: wallet.balance, talkTime: wallet.talkTime, transaction: newRecharge }
//       });
//     } else {
//       let wallet = await Wallet.findOne({ userId });
//       if (wallet) {
//         const failedRecharge = {
//           amount: response.data.data?.amount ? response.data.data.amount / 100 : 0,
//           merchantTransactionId,
//           state: response.data.data?.state || 'FAILED',
//           responseCode: response.data.code,
//           rechargeMethod: "PhonePe",
//           rechargeDate: new Date(),
//           transactionId: merchantTransactionId
//         };
//         wallet.recharges.push(failedRecharge);
//         await wallet.save();
//         await sendNotification(userId, "Payment failed", `Your payment failed. Transaction ID: ${merchantTransactionId}.`);
//       }
//       return res.status(400).send({ success: false, message: "Payment validation failed", data: response.data });
//     }
//   } catch (error) {
//     console.error("Error in payment validation:", error);
//     return res.status(500).send({ error: "Payment validation failed" });
//   }
// };

export const validatePayment = async (req, res) => {
  const { merchantTransactionId, userId, planId } = req.body;

  if (!merchantTransactionId || !userId || !planId) {
    return res.status(400).send("Invalid transaction ID, user ID, or plan ID");
  }

  try {
    const statusUrl = `${process.env.PHONE_PE_HOST_URL}/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}`;
    const stringToHash = `/pg/v1/status/${process.env.MERCHANT_ID}/${merchantTransactionId}${process.env.SALT_KEY}`;
    const sha256Hash = sha256(stringToHash);
    const xVerifyChecksum = `${sha256Hash}###${process.env.SALT_INDEX}`;

    const response = await axios.get(statusUrl, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": xVerifyChecksum,
        "X-MERCHANT-ID": process.env.MERCHANT_ID,
        accept: "application/json",
      },
    });

    console.log("Payment status response:", response.data);

    if (!response.data || !response.data.code || !response.data.data) {
      return res.status(400).send({ success: false, message: "Invalid response from payment gateway" });
    }

    const { code, data } = response.data;
    const { state, amount } = data;

    // Fetch the subscription plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(400).send("Invalid plan ID");
    }

    const { price, talkTime } = plan;

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

    const transactionRecord = {
      amount: amount ? amount / 100 : 0,
      merchantTransactionId,
      state: state || 'PENDING',
      responseCode: code,
      rechargeMethod: "PhonePe",
      rechargeDate: new Date(),
      transactionId: merchantTransactionId,
      planId: planId
    };

    // Check if this transaction already exists in wallet
    const existingTransaction = wallet.recharges.find(
      t => t.merchantTransactionId === merchantTransactionId
    );

    if (existingTransaction) {
      // Update existing transaction if state changed
      if (existingTransaction.state !== state) {
        existingTransaction.state = state;
        existingTransaction.responseCode = code;
        await wallet.save();
      }
    } else {
      // Add new transaction record
      wallet.recharges.push(transactionRecord);
      await wallet.save();
    }

    // Handle different payment states
    switch (state) {
      case 'COMPLETED':
        if (code === 'PAYMENT_SUCCESS') {
          // Only add balance if this is a new completion
          if (!existingTransaction || existingTransaction.state !== 'COMPLETED') {
            const newBalance = wallet.balance + talkTime;
            wallet.balance = newBalance;
            wallet.talkTime = (wallet.talkTime || 0) + talkTime;
            await wallet.save();

            await sendNotification(
              userId,
              "Payment Successful",
              `Your wallet has been credited with ₹${transactionRecord.amount}. ` +
              `New balance: ₹${wallet.balance}. ` +
              `You have been credited with ${talkTime} minutes of talk time.`
            );
          }

          return res.status(200).send({
            success: true,
            message: "Payment validated and wallet updated",
            data: {
              balance: wallet.balance,
              talkTime: wallet.talkTime,
              transaction: transactionRecord
            }
          });
        }
        break;

      case 'PENDING':
        await sendNotification(
          userId,
          "Payment Pending",
          `Your payment of ₹${transactionRecord.amount} is pending. ` +
          `Transaction ID: ${merchantTransactionId}.`
        );
        return res.status(200).send({
          success: true,
          message: "Payment is pending",
          data: { transaction: transactionRecord }
        });

      case 'FAILED':
        await sendNotification(
          userId,
          "Payment Failed",
          `Your payment of ₹${transactionRecord.amount} failed. ` +
          `Transaction ID: ${merchantTransactionId}.`
        );
        return res.status(400).send({
          success: false,
          message: "Payment failed",
          data: { transaction: transactionRecord }
        });

      default:
        await sendNotification(
          userId,
          "Payment Status Unknown",
          `Your payment status is unknown. ` +
          `Transaction ID: ${merchantTransactionId}. ` +
          `Please contact support.`
        );
        return res.status(400).send({
          success: false,
          message: "Unknown payment status",
          data: { transaction: transactionRecord }
        });
    }

  } catch (error) {
    console.error("Error in payment validation:", error);

    // Try to send a notification about the error
    try {
      await sendNotification(
        userId,
        "Payment Verification Error",
        `There was an error verifying your payment. ` +
        `Transaction ID: ${merchantTransactionId}. ` +
        `Please contact support.`
      );
    } catch (notificationError) {
      console.error("Failed to send error notification:", notificationError);
    }

    return res.status(500).send({
      success: false,
      error: "Payment validation failed",
      message: error.message
    });
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


