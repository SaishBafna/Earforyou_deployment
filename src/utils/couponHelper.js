import { Coupon, CouponUsage } from '../models/CouponSystem/couponModel.js';
import { ApiError } from './ApiError.js';

/**
 * Validates and applies a coupon to an order
 * @param {string} couponCode - The coupon code to validate and apply
 * @param {mongoose.Types.ObjectId} userId - The user ID applying the coupon
 * @param {number} amount - The order amount before discount
 * @param {boolean} isStaff - Whether the user is staff (default: false)
 * @returns {Promise<Object>} - Object containing coupon application details
 * @throws {ApiError} - If coupon validation fails
 */

export const validateAndApplyCoupon = async (couponCode, userId, amount, isStaff = false, rechargeType = 'days') => {
    try {
        // Convert amount to number to ensure proper calculations
        amount = Number(amount);
        if (isNaN(amount) || amount <= 0) {
            throw new ApiError(400, 'Invalid order amount');
        }

        // Find coupon (case insensitive search since we uppercase it in pre-save)
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
        if (!coupon) {
            throw new ApiError(404, 'Coupon not found');
        }

        // Validate coupon type based on recharge type
        if (rechargeType === 'wallet' && coupon.discountType !== 'percentage') {
            throw new ApiError(400, 'Wallet recharge only accepts percentage discount coupons');
        }
        
        if (rechargeType === 'days' && coupon.discountType !== 'free_days') {
            throw new ApiError(400, 'Days recharge only accepts free days coupons');
        }

        // Check basic usability
        if (!coupon.isReusable) {
            if (!coupon.isActive) {
                throw new ApiError(400, 'Coupon is not active');
            }
            if (coupon.isExpired) {
                throw new ApiError(400, 'Coupon has expired');
            }
            if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
                throw new ApiError(400, 'Coupon usage limit reached');
            }
        }

        // Check staff-only restriction
        if (coupon.isStaffOnly && !isStaff) {
            throw new ApiError(403, 'This coupon is for staff only');
        }

        // Check minimum order amount (only for wallet recharge)
        if (rechargeType === 'wallet' && coupon.minimumOrderAmount && amount < coupon.minimumOrderAmount) {
            throw new ApiError(400, `Minimum order amount of ₹${coupon.minimumOrderAmount} required`);
        }

        // Check user usage limit (unless coupon is reusable)
        if (!coupon.isReusable) {
            const usageCount = await CouponUsage.countDocuments({
                coupon: coupon._id,
                user: userId
            });

            if (usageCount >= coupon.maxUsesPerUser) {
                throw new ApiError(400, 'Maximum uses reached for this coupon');
            }
        }

        // Calculate discount based on coupon type
        let discountAmount = 0;
        let finalAmount = amount;
        let freeDays = 0;

        switch (coupon.discountType) {
            case 'percentage':
                discountAmount = amount * (coupon.discountValue / 100);
                // Ensure discount doesn't exceed order amount
                discountAmount = Math.min(discountAmount, amount);
                finalAmount = amount - discountAmount;
                break;
            case 'fixed':
                // Fixed amount coupons only valid for specific cases (not for wallet/days)
                throw new ApiError(400, 'Fixed amount coupons not valid for this recharge type');
            case 'free_days':
                freeDays = coupon.discountValue;
                break;
            default:
                throw new ApiError(500, 'Invalid coupon discount type');
        }

        // Ensure all amounts are valid numbers (for wallet recharge)
        if (rechargeType === 'wallet' && (isNaN(discountAmount) || isNaN(finalAmount))) {
            throw new ApiError(500, 'Invalid coupon calculation');
        }

        return {
            coupon,
            originalAmount: amount,
            discountAmount,
            finalAmount,
            freeDays,
            isValid: true
        };

    } catch (error) {
        // Handle specific errors or rethrow ApiError
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to validate coupon', error.message);
    }
};

/**
 * Records a coupon usage transaction
 * @param {mongoose.Types.ObjectId} couponId - The coupon ID
 * @param {mongoose.Types.ObjectId} userId - The user ID
 * @param {mongoose.Types.ObjectId} transactionId - The transaction ID
 * @param {number} discountApplied - The discount amount applied
 * @returns {Promise<void>}
 */
export const recordCouponTransaction = async (couponId, userId, transactionId, discountApplied) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Create coupon usage record
        await CouponUsage.create([{
            coupon: couponId,
            user: userId,
            transaction: transactionId,
            discountApplied
        }], { session });

        // Increment coupon usage count (unless it's reusable)
        const coupon = await Coupon.findById(couponId).session(session);
        if (!coupon.isReusable) {
            await Coupon.findByIdAndUpdate(couponId, {
                $inc: { currentUses: 1 }
            }, { session });
        }

        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};