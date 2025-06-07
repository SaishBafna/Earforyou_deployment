import mongoose from 'mongoose';

// Coupon Model
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
    },

    // ✅ Pricing Type
    applicablePricingTypes: {
        type: [String],
        enum: ['chat', 'call', 'platform_charges', 'other'],
        default: ['chat', 'call', 'video', 'platform_charges']
    },

    // ✅ Pricing IDs with refPath
    applicablePricingIds: [{
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'applicablePricingModelTypes'
    }],
    applicablePricingModelTypes: [{
        type: String,
        enum: ['ChatPremium', 'SubscriptionPlan', 'MyPlan'] // replace with actual model names
    }],

    // ✅ Multiple payment methods
    applicablePaymentMethods: {
        type: [String],
        enum: ['wallet', 'credit_card', 'debit_card', 'net_banking', 'upi', 'other'],
        default: ['wallet', 'credit_card', 'debit_card', 'net_banking', 'upi']
    },

    // ✅ Multiple service types
    applicableServiceTypes: {
        type: [String],
        default: []
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

// Methods
couponSchema.methods.isApplicableToPricingType = function (pricingType) {
    return this.applicablePricingTypes.length === 0 ||
        this.applicablePricingTypes.includes(pricingType);
};

couponSchema.methods.isApplicableToPaymentMethod = function (paymentMethod) {
    return this.applicablePaymentMethods.length === 0 ||
        this.applicablePaymentMethods.includes(paymentMethod);
};

couponSchema.methods.isApplicableToPricingId = function (pricingId) {
    return this.applicablePricingIds.length === 0 ||
        this.applicablePricingIds.some(id => id.equals(pricingId));
};

// CouponUsage Schema
const usageSchema = new mongoose.Schema({
    coupon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon',
        required: true
    },
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    discountApplied: {
        type: Number,
        required: true
    },

    // ✅ Array of pricing types
    pricingTypes: {
        type: [String],
        enum: ['chat', 'call', 'platform_charges', 'other'],
        default: []
    },

    // ✅ Array of pricing IDs with refPath
    pricingIds: [{
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'pricingModelTypes'
    }],
    pricingModelTypes: [{
        type: String,
        enum: ['ChatPricing', 'CallPricing', 'PlatformPricing'] // update accordingly
    }],

    // ✅ Array of payment methods
    paymentMethods: {
        type: [String],
        enum: ['wallet', 'credit_card', 'debit_card', 'net_banking', 'upi', 'other'],
        default: []
    },

    orderAmount: {
        type: Number
    },

    discountedAmount: {
        type: Number
    }
}, { timestamps: true });

usageSchema.index({ coupon: 1, admin: 1 });
usageSchema.index({ pricingIds: 1 });

// Safe model definitions
export const Coupon = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
export const CouponUsage = mongoose.models.CouponUsage || mongoose.model('CouponUsage', usageSchema);
