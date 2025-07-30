// models/PendingTransaction.js
import mongoose from 'mongoose';

const pendingTransactionSchema = new mongoose.Schema({
  merchantTransactionId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true
  },
  amount: {
    type: Number
  },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  processedAt: {
    type: Date
  },
  processed: {
    type: Boolean,
    default: false
  },
  failureReason: {
    type: String
  },
  responseData: {
    type: Object
  }
});

const PendingTransaction = mongoose.model('PendingTransaction', pendingTransactionSchema);
export default PendingTransaction;