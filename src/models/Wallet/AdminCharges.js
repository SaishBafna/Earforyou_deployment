// src/lib/AdminCharges.js
import mongoose from 'mongoose';

const CallRateSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',  
    required: true
  },
  adminCommissionPercent: {
    type: Number,

  },
  ratePerMinute: {
    type: Number,

  },
  free: {
    type: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
CallRateSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const CallRate = mongoose.models.CallRate || mongoose.model('CallRate', CallRateSchema);

