import mongoose from 'mongoose';

const PaymentDetailsSchema = new mongoose.Schema({
  gateway: {
    type: String,
    enum: ['PhonePe', 'RazorPay', 'Admin', 'Internal'],
    required: true
  },
  transactionId: {
    type: String,
    required: true
  },
  orderId: String,
  paymentId: String,
  signature: String,
  amount: Number,
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['created', 'pending', 'success', 'failed', 'refunded'],
    default: 'pending'
  },
  gatewayResponse: mongoose.Schema.Types.Mixed,
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
}, { _id: false });

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  balance: {
    type: Number,
    required: true,
    default: 0,
  },
  currency: {
    type: String,
    required: true,
    default: 'inr',
  },

  recharges: [
    {
      amount: {
        type: Number,
        required: true,
      },
      payment: PaymentDetailsSchema,
      rechargeDate: {
        type: Date,
        default: Date.now,
      },
    },
  ],

  deductions: [
    {
      amount: {
        type: Number,
        required: true,
      },
      deductionReason: {
        type: String,
        required: true,
      },
      deductionDate: {
        type: Date,
        default: Date.now,
      },
      callId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Call',
        required: false,
      },
    },
  ],
  plan: [
    {
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan',
        required: false,
        default: null
      }
    }
  ],
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

walletSchema.methods.deductBalanceAndMinutes = async function (amount, minutes, planId) {
  if (this.balance < amount) {
    throw new Error('Insufficient balance');
  }

  this.balance -= amount;

  const plan = this.plans.find(plan => plan.planId.toString() === planId.toString() && plan.status === 'active');

  if (!plan) {
    throw new Error('Active plan not found');
  }

  if (plan.minutesLeft < minutes) {
    throw new Error('Not enough minutes in the plan');
  }

  plan.minutesLeft -= minutes;

  await this.save();

  return { balance: this.balance, minutesLeft: plan.minutesLeft };
};

const Wallet = mongoose.model('Wallet', walletSchema);
export default Wallet;