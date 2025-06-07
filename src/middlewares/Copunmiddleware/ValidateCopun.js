// import { Coupon, CouponUsage } from '../../models/CouponSystem/couponModel.js';

// export const validateCoupon = async (req, res) => {
//     const { couponCode, userId, pricingType,pricingId } = req.query;

//     // If no coupon code provided, return success (coupon is optional)
//     if (!couponCode) {
//         return res.status(200).json({
//             success: true,
//             message: 'Coupon code is not required'
//         });
//     }

//     try {
//         // Find the coupon
//         const coupon = await Coupon.findOne({
//             code: couponCode.toUpperCase()
//         });

//         // Check if coupon exists
//         if (!coupon) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Coupon not found'
//             });
//         }




//         // Enhanced pricing validation
//         if (pricingId) {
//             // Check against restricted pricing IDs if any exist
//             if (coupon.applicablePricingIds.length > 0 &&
//                 !coupon.applicablePricingIds.some(id => id.equals(new mongoose.Types.ObjectId(pricingId)))) {
//                 return res.status(400).json({
//                     success: false,
//                     message: 'Coupon not valid for the selected pricing plan'
//                 });
//             }

//             // If you have pricingType in request, validate that too
//             if (pricingType && coupon.applicablePricingTypes.length > 0 &&
//                 !coupon.applicablePricingTypes.includes(pricingType)) {
//                 return res.status(400).json({
//                     success: false,
//                     message: 'Coupon not valid for this type of service'
//                 });
//             }
//         }
//         // Check if coupon is active
//         if (!coupon.isActive) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Coupon is not active'
//             });
//         }

//         // Check if coupon has expired
//         if (coupon.isExpired || (coupon.validUntil && new Date(coupon.validUntil) < new Date())) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Coupon has expired'
//             });
//         }

//         // Check if coupon has reached max uses
//         if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Coupon usage limit reached'
//             });
//         }

//         // Check user-specific limits if userId is provided
//         if (userId) {
//             // Check if user has already used this coupon (for non-reusable coupons)
//             if (!coupon.isReusable) {
//                 const existingUsage = await CouponUsage.findOne({
//                     coupon: coupon._id,
//                     user: userId
//                 });

//                 if (existingUsage) {
//                     return res.status(400).json({
//                         success: false,
//                         message: 'You have already used this coupon'
//                     });
//                 }
//             }

//             // Check max uses per user
//             if (coupon.maxUsesPerUser) {
//                 const userUsageCount = await CouponUsage.countDocuments({
//                     coupon: coupon._id,
//                     user: userId
//                 });

//                 if (userUsageCount >= coupon.maxUsesPerUser) {
//                     return res.status(400).json({
//                         success: false,
//                         message: 'You have reached the maximum usage limit for this coupon'
//                     });
//                 }
//             }
//         }

//         // If all checkas passed, return coupon details
//         return res.status(200).json({
//             success: true,
//             message: 'Coupon is valid',
//             coupon: {
//                 code: coupon.code,
//                 discountType: coupon.discountType,
//                 discountValue: coupon.discountValue,
//                 minOrderAmount: coupon.minOrderAmount,
//                 validUntil: coupon.validUntil
//             }
//         });

//     } catch (error) {
//         console.error('Coupon validation error:', error);
//         return res.status(500).json({
//             success: false,
//             message: 'Error validating coupon'
//         });
//     }
// };



import mongoose from 'mongoose';
import { Coupon, CouponUsage } from '../../models/CouponSystem/couponModel.js';

export const validateCoupon = async (req, res) => {
    const { couponCode, userId, pricingType, pricingId } = req.query;

    if (!couponCode) {
        return res.status(200).json({
            success: true,
            message: 'Coupon code is not required'
        });
    }

    try {
        // Find the coupon (case-insensitive search)
        const coupon = await Coupon.findOne({
            code: couponCode.toUpperCase()
        });

        if (!coupon) {
            return res.status(404).json({
                success: false,
                error: 'COUPON_NOT_FOUND',
                message: 'Coupon not found'
            });
        }

        // Check coupon status
        if (!coupon.isActive) {
            return res.status(400).json({
                success: false,
                error: 'COUPON_INACTIVE',
                message: 'Coupon is not active'
            });
        }

        // Check expiry
        const now = new Date();
        if (coupon.isExpired || (coupon.validUntil && new Date(coupon.validUntil) < now) {
            return res.status(400).json({
                success: false,
                error: 'COUPON_EXPIRED',
                message: 'Coupon has expired'
            });
        }

        // Check max uses
        if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
            return res.status(400).json({
                success: false,
                error: 'COUPON_LIMIT_REACHED',
                message: 'Coupon usage limit reached'
            });
        }

        // Validate pricing restrictions
        if (pricingId) {
            // Validate pricing ID format if needed
            if (!mongoose.Types.ObjectId.isValid(pricingId)) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_PRICING_ID',
                    message: 'Invalid pricing ID format'
                });
            }

            // Check against restricted pricing IDs
            if (coupon.applicablePricingIds.length > 0 &&
                !coupon.applicablePricingIds.some(id => id.equals(new mongoose.Types.ObjectId(pricingId)))) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_PRICING_PLAN',
                    message: 'Coupon not valid for the selected pricing plan'
                });
            }

            // Validate pricing type
            if (pricingType && coupon.applicablePricingTypes.length > 0 &&
                !coupon.applicablePricingTypes.includes(pricingType)) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_PRICING_TYPE',
                    message: 'Coupon not valid for this type of service'
                });
            }
        }

        // Check user-specific limits
        if (userId) {
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_USER_ID',
                    message: 'Invalid user ID format'
                });
            }

            const userObjectId = new mongoose.Types.ObjectId(userId);

            if (!coupon.isReusable) {
                const existingUsage = await CouponUsage.findOne({
                    coupon: coupon._id,
                    user: userObjectId
                });

                if (existingUsage) {
                    return res.status(400).json({
                        success: false,
                        error: 'COUPON_ALREADY_USED',
                        message: 'You have already used this coupon'
                    });
                }
            }

            if (coupon.maxUsesPerUser) {
                const userUsageCount = await CouponUsage.countDocuments({
                    coupon: coupon._id,
                    user: userObjectId
                });

                if (userUsageCount >= coupon.maxUsesPerUser) {
                    return res.status(400).json({
                        success: false,
                        error: 'USER_LIMIT_REACHED',
                        message: 'You have reached the maximum usage limit for this coupon'
                    });
                }
            }
        }

        // Successful validation
        return res.status(200).json({
            success: true,
            message: 'Coupon is valid',
            data: {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                minOrderAmount: coupon.minOrderAmount,
                validUntil: coupon.validUntil,
                couponId: coupon._id // Include coupon ID for reference
            }
        });

    } catch (error) {
        console.error('Coupon validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Error validating coupon',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};