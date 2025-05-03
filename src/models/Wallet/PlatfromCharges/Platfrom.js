import mongoose from 'mongoose';

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
    transactionId: {
        type: String,
        required: true,
        unique: true
    },
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

    // If status is 'active' and endDate is today, set status to 'expired' and endDate to 23:59
    if (this.status === 'active' && this.endDate) {
        const endDateDay = new Date(this.endDate).setHours(0, 0, 0, 0);
        const todayDay = todayStart.getTime();

        if (endDateDay === todayDay) {
            this.status = 'expired';
            this.endDate = todayEnd;
        }
    }

    // If status is 'queued' and startDate is today, set status to 'active' and startDate to 12:00
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

    // Update active plans that expire today
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

    // Update queued plans that start today
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