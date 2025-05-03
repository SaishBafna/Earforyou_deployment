import express from 'express';

import {
    createCoupon,
    validateCoupon,
    recordUsage,
    getUserCoupons,
    getAllCoupons,
    toggleCouponStatus
} from '../../controllers/CouponController/couponController.js';
import { protect } from '../../middlewares/auth/authMiddleware.js';

const router = express.Router();

// User routes
router.post('/coupon', protect, createCoupon);
router.post('/coupon/validate', protect, validateCoupon);
router.post('/coupon/usage', protect, recordUsage);
router.get('/coupon/my-coupons', protect, getUserCoupons);

// // Admin routes
// router.get('/', protect, getAllCoupons);
// router.put('/:id/toggle', protect, toggleCouponStatus);

export default router;