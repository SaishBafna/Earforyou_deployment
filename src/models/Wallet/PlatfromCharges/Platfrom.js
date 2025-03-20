import mongoose from 'mongoose';

const PlatformChargesSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    planName: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'expired'], // Updated enum to match controller
        default: 'pending' // Default changed to 'pending' as per buyPlanWithPayment
    },
    transactionId: { // Added to store payment gateway transaction ID
        type: String,
        required: true,
        unique: true // Ensures no duplicate transactions
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
    
});

const PlatformCharges = mongoose.model('PlatformCharges', PlatformChargesSchema);
export default PlatformCharges;