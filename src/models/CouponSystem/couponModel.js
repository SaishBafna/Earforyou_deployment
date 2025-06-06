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
    },
    applicablePricingTypes: {
        type: [String],
        enum: ['chat', 'call', 'platform_charges', 'other'],
        default: ['chat', 'call','platform_charges']
    },
    // New field for specific pricing IDs
    applicablePricingIds: {
        type: [mongoose.Schema.Types.ObjectId],
        default: [], // Empty array means applicable to all pricing IDs
        ref: 'Pricing' // Assuming you have a Pricing model
    },
    applicablePaymentMethods: {
        type: [String],
        enum: ['wallet', 'credit_card', 'debit_card', 'net_banking', 'upi', 'other'],
        default: ['wallet', 'credit_card', 'debit_card', 'net_banking', 'upi']
    },
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

couponSchema.methods.isApplicableToPricingType = function(pricingType) {
    return this.applicablePricingTypes.length === 0 || 
           this.applicablePricingTypes.includes(pricingType);
};

couponSchema.methods.isApplicableToPaymentMethod = function(paymentMethod) {
    return this.applicablePaymentMethods.length === 0 || 
           this.applicablePaymentMethods.includes(paymentMethod);
};

// New method to check if coupon is applicable to a specific pricing ID
couponSchema.methods.isApplicableToPricingId = function(pricingId) {
    return this.applicablePricingIds.length === 0 || 
           this.applicablePricingIds.some(id => id.equals(pricingId));
};

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
    },
    pricingType: {
        type: String,
        enum: ['chat', 'call', 'platform_charges', 'other'],
        required: true
    },
    // New field to track the specific pricing ID used
    pricingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pricing',
        required: false // Optional if not all usages are tied to specific pricing
    },
    paymentMethod: {
        type: String,
        enum: ['wallet', 'credit_card', 'debit_card', 'net_banking', 'upi', 'other'],
        required: true
    },
    serviceType: String,
    orderAmount: {
        type: Number,
        required: true
    },
    discountedAmount: {
        type: Number,
        required: true
    }
}, { timestamps: true });

usageSchema.index({ coupon: 1, user: 1 });
usageSchema.index({ pricingId: 1 }); // New index for faster queries by pricing ID

export const CouponUsage = mongoose.model('CouponUsage', usageSchema);