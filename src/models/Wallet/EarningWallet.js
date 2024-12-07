import mongoose from "mongoose";

const earningWalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0, // Updated dynamically
    },
    totalDeductions: {
      type: Number,
      required: true,
      default: 0, // Updated dynamically
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    deductions: [
      {
        amount: {
          type: Number,
          required: true,
        },
        reason: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    earnings: [
      {
        amount: {
          type: Number,
          required: true,
        },
        source: {
          type: String, // e.g., 'call', 'bonus', etc.
          required: true,
        },
        state: {
          type: String,
          required: true,
        },
        responseCode: {
          type: String, // e.g., 'call', 'bonus', etc.
          required: true,
        },
        merchantTransactionId: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Middleware to calculate balance and total deductions
earningWalletSchema.pre("save", function (next) {
  const wallet = this;

  // Calculate total deductions
  wallet.totalDeductions = wallet.deductions.reduce(
    (sum, deduction) => sum + deduction.amount,
    0
  );

  // Calculate total earnings
  const totalEarnings = wallet.earnings.reduce(
    (sum, earning) => sum + earning.amount,
    0
  );

  // Update the balance: earnings - total deductions
  wallet.balance = totalEarnings - wallet.totalDeductions;

  next();
});

export default mongoose.model("EarningWallet", earningWalletSchema);
