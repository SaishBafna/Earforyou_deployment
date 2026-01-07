import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK AUTH MIDDLEWARE
=========================== */

jest.mock("../../src/middlewares/auth/authMiddleware.js", () => ({
  protect: (req, res, next) => {
    req.user = { _id: "507f1f77bcf86cd799439011" };
    next();
  },
}));

/* ===========================
   MOCK CONTROLLERS
=========================== */

jest.mock(
  "../../src/controllers/CouponController/couponController.js",
  () => ({
    createCoupon: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        message: "Coupon created",
        couponId: "coupon123",
      })
    ),

    validateCoupon: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        valid: true,
        discount: 20,
      })
    ),

    recordUsage: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Usage recorded",
      })
    ),

    getUserCoupons: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        coupons: [],
      })
    ),

    getAllCoupons: jest.fn(),
    toggleCouponStatus: jest.fn(),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Coupon Routes API", () => {
  it("POST /api/coupon - should create a coupon", async () => {
    const res = await request(app)
      .post("/api/coupon")
      .send({
        code: "SAVE20",
        discount: 20,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.couponId).toBeDefined();
  });

  it("POST /api/coupon/validate - should validate a coupon", async () => {
    const res = await request(app)
      .post("/api/coupon/validate")
      .send({
        code: "SAVE20",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it("POST /api/coupon/usage - should record coupon usage", async () => {
    const res = await request(app)
      .post("/api/coupon/usage")
      .send({
        couponId: "coupon123",
        orderId: "order123",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Usage recorded");
  });

  it("GET /api/coupon/my-coupons - should get user coupons", async () => {
    const res = await request(app).get("/api/coupon/my-coupons");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.coupons)).toBe(true);
  });
});
