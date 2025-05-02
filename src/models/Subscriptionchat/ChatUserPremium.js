import mongoose from "mongoose";

const PaymentStateSchema = new mongoose.Schema({
  merchantTransactionId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true }, // in rupees
  currency: { type: String, default: "INR" },
  status: { 
    type: String,
    enum: ["PENDING", "COMPLETED", "FAILED", "REFUNDED", "EXPIRED"],
    required: true
  },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed }, // Raw response from payment gateway
  initiatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
}, { _id: false });

const ChatUserPremiumSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatPremium",
    required: true
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: true
  },
  remainingChats: {
    type: Number,
    required: true
  },
  usedChats: [
    {
      chatId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      usedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  isActive: {
    type: Boolean,
    default: true
  },
  payment: {
    type: PaymentStateSchema,
    required: true
  }
}, { timestamps: true });

// Indexes for better performance
ChatUserPremiumSchema.index({ user: 1, isActive: 1 });
ChatUserPremiumSchema.index({ expiryDate: 1 });
ChatUserPremiumSchema.index({ "payment.merchantTransactionId": 1 }, { unique: true });

// Pre-save hook to handle subscription activation
ChatUserPremiumSchema.pre('save', function(next) {
  if (this.isModified('payment.status') && this.payment.status === 'COMPLETED') {
    this.isActive = true;
  }
  next();
});

// Static method to create subscription after successful payment
ChatUserPremiumSchema.statics.createFromPayment = async function(
  userId,
  planId,
  paymentData
) {
  const plan = await mongoose.model('ChatPremium').findById(planId);
  if (!plan) {
    throw new Error('Invalid subscription plan');
  }

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + plan.validityDays);

  return this.create({
    user: userId,
    plan: planId,
    expiryDate,
    remainingChats: plan.chatsAllowed,
    isActive: paymentData.status === 'COMPLETED',
    payment: paymentData
  });
};

export const ChatUserPremium = mongoose.model("ChatUserPremium", ChatUserPremiumSchema);