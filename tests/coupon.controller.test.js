import {
  createCoupon,
  validateCoupon,
  recordUsage,
  getUserCoupons,
  getAllCoupons,
  toggleCouponStatus
} from "../../src/controllers/CouponSystem/couponController.js";

import { Coupon, CouponUsage } from "../../src/models/CouponSystem/couponModel.js";

/* ===========================
   MOCK MODELS
=========================== */
jest.mock("../../src/models/CouponSystem/couponModel.js");

/* ===========================
   MOCK RESPONSE
=========================== */
const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

describe("Coupon Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ===========================
     createCoupon
  =========================== */
  it("should create a coupon", async () => {
    Coupon.create.mockResolvedValue({ code: "SAVE10" });

    const req = {
      body: { code: "SAVE10" },
      user: { _id: "user1", canCreateCoupons: true }
    };

    const res = mockRes();

    await createCoupon(req, res);

    expect(Coupon.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  /* ===========================
     validateCoupon
  =========================== */
  it("should validate percentage coupon", async () => {
    Coupon.findOne.mockResolvedValue({
      _id: "coupon1",
      code: "SAVE10",
      isUsable: true,
      isStaffOnly: false,
      discountType: "percentage",
      discountValue: 10,
      maxUsesPerUser: 5
    });

    CouponUsage.countDocuments.mockResolvedValue(0);

    const req = {
      body: { couponCode: "save10", orderAmount: 100 },
      user: { _id: "user1", isStaff: false }
    };

    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        discount: 10,
        finalAmount: 90
      })
    );
  });

  it("should fail if coupon not found", async () => {
    Coupon.findOne.mockResolvedValue(null);

    const req = {
      body: { couponCode: "INVALID" },
      user: { _id: "user1" }
    };

    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  /* ===========================
     recordUsage
  =========================== */
  it("should record coupon usage", async () => {
    CouponUsage.create.mockResolvedValue({ _id: "usage1" });
    Coupon.findByIdAndUpdate.mockResolvedValue(true);

    const req = {
      body: {
        couponId: "coupon1",
        orderId: "order1",
        discountApplied: 20
      },
      user: { _id: "user1" }
    };

    const res = mockRes();

    await recordUsage(req, res);

    expect(CouponUsage.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  /* ===========================
     getUserCoupons
  =========================== */
  it("should return user coupons", async () => {
    Coupon.find.mockResolvedValue([{ code: "SAVE10" }]);

    const req = {
      user: { _id: "user1", isStaff: false }
    };

    const res = mockRes();

    await getUserCoupons(req, res);

    expect(res.json).toHaveBeenCalled();
  });

  /* ===========================
     getAllCoupons
  =========================== */
  it("should return all coupons", async () => {
    Coupon.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([{ code: "SAVE10" }])
    });

    const req = {};
    const res = mockRes();

    await getAllCoupons(req, res);

    expect(res.json).toHaveBeenCalled();
  });

  /* ===========================
     toggleCouponStatus
  =========================== */
  it("should toggle coupon status", async () => {
    const mockCoupon = {
      isActive: true,
      save: jest.fn()
    };

    Coupon.findById.mockResolvedValue(mockCoupon);

    const req = { params: { id: "coupon1" } };
    const res = mockRes();

    await toggleCouponStatus(req, res);

    expect(mockCoupon.isActive).toBe(false);
    expect(res.json).toHaveBeenCalled();
  });
});
