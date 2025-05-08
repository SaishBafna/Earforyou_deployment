import { Coupon,CouponUsage } from '../../models/CouponSystem/couponModel.js';

export const validateCoupon = async (req, res, next) => {
    const { couponCode, userId } = req.query;

    // If no coupon code provided, just proceed
    if (!couponCode) {
        return next();
    }

    try {
        // Find the coupon
        const coupon = await Coupon.findOne({
            code: couponCode.toUpperCase()
        });

        // Check if coupon exists
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // Check if coupon is active and not expired
        if (!coupon.isActive || coupon.isExpired) {
            return res.status(400).json({
                success: false,
                message: coupon.isExpired ? 'Coupon has expired' : 'Coupon is not active'
            });
        }

        // Check if coupon has reached max uses
        if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
            return res.status(400).json({
                success: false,
                message: 'Coupon usage limit reached'
            });
        }

        // Check if user has already used this coupon (for non-reusable coupons)
        if (!coupon.isReusable) {
            const existingUsage = await CouponUsage.findOne({
                coupon: coupon._id,
                user: userId
            });
            
            if (existingUsage) {
                return res.status(400).json({
                    success: false,
                    message: 'You have already used this coupon'
                });
            }
        }

        // Check max uses per user
        if (coupon.maxUsesPerUser) {
            const userUsageCount = await CouponUsage.countDocuments({
                coupon: coupon._id,
                user: userId
            });
            
            if (userUsageCount >= coupon.maxUsesPerUser) {
                return res.status(400).json({
                    success: false,
                    message: 'You have reached the maximum usage limit for this coupon'
                });
            }
        }

        // Attach valid coupon to request for later use
        req.validCoupon = coupon;
        next();

    } catch (error) {
        console.error('Coupon validation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error validating coupon'
        });
    }
};