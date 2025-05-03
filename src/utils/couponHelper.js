import { Coupon, CouponUsage } from '../models/CouponSystem/couponModel.js';
import { ApiError } from './ApiError.js';
export const validateAndApplyCoupon = async (couponCode, userId, amount) => {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

    if (!coupon) {
        throw new ApiError(404, 'Coupon not found');
    }

    if (!coupon.isUsable) {
        throw new ApiError(400, coupon.isExpired ? 'Coupon has expired' : 'Coupon is not active');
    }

    if (coupon.isStaffOnly && !req.user?.isStaff) {
        throw new ApiError(403, 'This coupon is for staff only');
    }

    const usageCount = await CouponUsage.countDocuments({
        coupon: coupon._id,
        user: userId
    });

    if (usageCount >= coupon.maxUsesPerUser) {
        throw new ApiError(400, 'Maximum uses reached for this coupon');
    }

    if (coupon.minimumOrderAmount && amount < coupon.minimumOrderAmount) {
        throw new ApiError(400, `Minimum order amount of ₹${coupon.minimumOrderAmount} required`);
    }

    let discountAmount = 0;
    let finalAmount = amount;
    let freeDays = 0;

    switch (coupon.discountType) {
        case 'percentage':
            discountAmount = amount * (coupon.discountValue / 100);
            finalAmount = amount - discountAmount;
            break;
        case 'fixed':
            discountAmount = Math.min(amount, coupon.discountValue);
            finalAmount = amount - discountAmount;
            break;
        case 'free_days':
            freeDays = coupon.discountValue;
            break;
    }

    return {
        coupon,
        originalAmount: amount,
        discountAmount,
        finalAmount,
        freeDays,
        isValid: true
    };
};

export const recordCouponTransaction = async (couponId, userId, transactionId, discountApplied) => {
    await CouponUsage.create({
        coupon: couponId,
        user: userId,
        transaction: transactionId,
        discountApplied
    });

    await Coupon.findByIdAndUpdate(couponId, {
        $inc: { currentUses: 1 }
    });
};