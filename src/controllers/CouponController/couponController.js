import { Coupon, CouponUsage } from "../../models/CouponSystem/couponModel";
// Create a new coupon
export const createCoupon = async (req, res) => {
    try {
        const { user } = req;
        const couponData = {
            ...req.body,
            createdBy: user._id,
            ownerType: user.canCreateCoupons ? 'user' : 'company'
        };

        const coupon = await Coupon.create(couponData);
        res.status(201).json(coupon);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Validate a coupon
export const validateCoupon = async (req, res) => {
    try {
        const { couponCode, orderAmount = 0 } = req.body;
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

        if (!coupon) throw new Error('Coupon not found');
        if (!coupon.isUsable) throw new Error('Coupon is not usable');
        if (coupon.isStaffOnly && !req.user.isStaff) throw new Error('Staff only coupon');
        if (coupon.minimumOrderAmount && orderAmount < coupon.minimumOrderAmount) {
            throw new Error(`Minimum order amount of ${coupon.minimumOrderAmount} required`);
        }

        const usageCount = await CouponUsage.countDocuments({
            coupon: coupon._id,
            user: req.user._id
        });

        if (usageCount >= coupon.maxUsesPerUser) {
            throw new Error('Maximum uses reached for this coupon');
        }

        let discount = 0;
        switch (coupon.discountType) {
            case 'percentage':
                discount = orderAmount * (coupon.discountValue / 100);
                break;
            case 'fixed':
                discount = Math.min(orderAmount, coupon.discountValue);
                break;
            case 'free_days':
                discount = coupon.discountValue; // Number of free days
                break;
        }

        res.json({
            coupon,
            discount,
            finalAmount: orderAmount - (coupon.discountType === 'free_days' ? 0 : discount)
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Record coupon usage
export const recordUsage = async (req, res) => {
    try {
        const { couponId, orderId, discountApplied } = req.body;

        const usage = await CouponUsage.create({
            coupon: couponId,
            user: req.user._id,
            order: orderId,
            discountApplied
        });

        await Coupon.findByIdAndUpdate(couponId, {
            $inc: { currentUses: 1 }
        });

        res.status(201).json(usage);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get user's available coupons
export const getUserCoupons = async (req, res) => {
    try {
        const query = {
            $or: [
                { ownerType: 'company', isPublic: true },
                { createdBy: req.user._id }
            ],
            isActive: true,
            expiryDate: { $gt: new Date() }
        };

        if (req.user.isStaff) {
            query.$or.push({ isStaffOnly: true });
        }

        const coupons = await Coupon.find(query);
        res.json(coupons);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Admin: Get all coupons
export const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().populate('createdBy', 'name email');
        res.json(coupons);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Admin: Toggle coupon status
export const toggleCouponStatus = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) throw new Error('Coupon not found');

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        res.json(coupon);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};