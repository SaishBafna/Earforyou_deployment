import mongoose from 'mongoose';

// Define the structure for a subscription plan
const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,  // Plan name will be stored as text
      required: true, // Make it a required field
    },

    price: {
      type: Number,  // Price will be stored as a number
      required: true, // Make it a required field
    },

    talkTime: {
      type: Number,  // Talk time in minutes
      required: true, // Make it a required field
    },

    dailyLimit: {
      type: Number,  // Daily usage limit in minutes
      default: 0,    // If not specified, defaults to 0
    },
    validity: {
      type: Number, // Validity in days
      required: true,
    },
    description: {
      type: String,  // Description of the plan
      default: '',   // If not specified, defaults to an empty string
    },
  },
  {
    timestamps: true, // Automatically create createdAt and updatedAt fields
  }
);

// Check if the model already exists before defining it to avoid the "OverwriteModelError"
const SubscriptionPlan = mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan;
