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
    signature: String, // For RazorPay verification
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

const PlatformChargesSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MyPlan',
        required: true
    },
    planName: {
        type: String,
        default: "PlatForm Charges"
    },
    startDate: {
        type: Date,
    },
    endDate: {
        type: Date,
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'failed', 'active', 'expired', 'queued', 'queued_confirmed'],
        default: 'pending'
    },
    payment: PaymentDetailsSchema,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save middleware to update status based on dates
PlatformChargesSchema.pre('save', function (next) {
    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));

    if (this.status === 'active' && this.endDate) {
        const endDateDay = new Date(this.endDate).setHours(0, 0, 0, 0);
        const todayDay = todayStart.getTime();

        if (endDateDay === todayDay) {
            this.status = 'expired';
            this.endDate = todayEnd;
        }
    }

    if (this.status === 'queued' && this.startDate) {
        const startDateDay = new Date(this.startDate).setHours(0, 0, 0, 0);
        const todayDay = todayStart.getTime();

        if (startDateDay === todayDay) {
            this.status = 'active';
            this.startDate = new Date(today.setHours(12, 0, 0, 0));
        }
    }

    next();
});

// Static method to update statuses for all documents
PlatformChargesSchema.statics.updateStatuses = async function () {
    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));

    await this.updateMany(
        {
            status: 'active',
            endDate: {
                $gte: todayStart,
                $lte: todayEnd
            }
        },
        {
            $set: {
                status: 'expired',
                endDate: todayEnd
            }
        }
    );

    await this.updateMany(
        {
            status: 'queued',
            startDate: {
                $gte: todayStart,
                $lte: todayEnd
            }
        },
        {
            $set: {
                status: 'active',
                startDate: new Date(today.setHours(12, 0, 0, 0))
            }
        }
    );
};

const PlatformCharges = mongoose.model('PlatformCharges', PlatformChargesSchema);
export default PlatformCharges;