import mongoose from 'mongoose';

const myPlanSchema = new mongoose.Schema({
    planName: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    validityDays: {
        type: Number,
        required: true, // Plan validity in days
    },
    description: {
        type: String,
        required: false, // Optional field for additional details
    },
    benefits: {
        type: [String], // Array of benefits (e.g., ["100 minutes", "Priority support"])
        required: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const MyPlan = mongoose.model('MyPlan', myPlanSchema);
export default MyPlan;
