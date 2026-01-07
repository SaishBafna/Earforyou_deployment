import mongoose from 'mongoose';

const CallRatePerMinSchema = new mongoose.Schema({
    userCategory: {
        type: String,
        required: true,
        enum: ['Psychologist', 'Profisnal_listner', 'User'], // Add more categories if needed
    },
    userType: {
        type: String,
        enum: ['CALLER', 'RECEIVER'], // Only applicable for 'User' category
    },
    ratePerMinute: {
        type: Number,
        required: true,
    },
    adminCommissionPercent: {
        type: Number,
        required: true,
    }
}, { timestamps: true });

const CallRatePerMin = mongoose.model('CallRatePerMin', CallRatePerMinSchema);
export default CallRatePerMin;
