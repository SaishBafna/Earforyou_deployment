import mongoose from 'mongoose';

// Define the structure for a subscription plan
const subscriptionPlanSchema = new mongoose.Schema(
  {

    price: {
      type: Number,  // Price will be stored as a number
      required: true, // Make it a required field
    },

    talkTime: {
      type: Number,  // Talk time in minutes
      required: true, // Make it a required field
    },

   
  },
  {
    timestamps: true, // Automatically create createdAt and updatedAt fields
  }
);

// Check if the model already exists before defining it to avoid the "OverwriteModelError"
const SubscriptionPlan = mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan;
