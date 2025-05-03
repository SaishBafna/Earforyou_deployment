import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    description: String,
    discountType: {
        type: String,
        enum: ['percentage', 'fixed', 'free_days'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    maxUses: Number,
    currentUses: {
        type: Number,
        default: 0
    },
    maxUsesPerUser: {
        type: Number,
        default: 1
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: false
    },
    ownerType: {
        type: String,
        enum: ['company', 'user'],
        required: true
    },
    minimumOrderAmount: Number,

    isStaffOnly: {
        type: Boolean,
        default: false
    },
    isReusable: {
        type: Boolean,
        default: false
    },
    isPublic: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtuals
couponSchema.virtual('isExpired').get(function () {
    return this.expiryDate < new Date();
});

couponSchema.virtual('isUsable').get(function () {
    return this.isActive &&
        !this.isExpired &&
        (this.maxUses ? this.currentUses < this.maxUses : true);
});

// Pre-save hook
couponSchema.pre('save', function (next) {
    this.code = this.code.toUpperCase();
    next();
});

export const Coupon = mongoose.model('Coupon', couponSchema);

const usageSchema = new mongoose.Schema({
    coupon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    discountApplied: {
        type: Number,
        required: true
    }
}, { timestamps: true });

usageSchema.index({ coupon: 1, user: 1 });

export const CouponUsage = mongoose.model('CouponUsage', usageSchema);