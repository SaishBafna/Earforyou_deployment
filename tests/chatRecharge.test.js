import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK CONTROLLERS
=========================== */

jest.mock(
  "../../src/controllers/Recharge/ChatRecharge/ChatPayment.js",
  () => ({
    createChatPremium: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        message: "Chat premium created",
        planId: "plan123",
      })
    ),

    getAllChatPremiumPlans: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        plans: [],
      })
    ),

    validateChatPayment: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        paymentStatus: "VALID",
      })
    ),

    getPremiumUserDetails: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        user: {
          userId: req.params.userId,
          isPremium: true,
        },
      })
    ),
  })
);

/* ===========================
   MOCK COUPON MIDDLEWARE
=========================== */

jest.mock(
  "../../src/middlewares/Copunmiddleware/ValidateCopun.js",
  () => ({
    validateCoupon: (req, res, next) => {
      req.coupon = { code: "TEST10", discount: 10 };
      next();
    },
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Chat Recharge / Premium Routes API", () => {
  const userId = "507f1f77bcf86cd799439011";

  it("POST /api/chat-recharge/createChatPremium - should create chat premium", async () => {
    const res = await request(app)
      .post("/api/chat-recharge/createChatPremium")
      .send({
        name: "Gold Plan",
        price: 499,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.planId).toBeDefined();
  });

  it("GET /api/chat-recharge/getAllChatPremiumPlans - should return all plans", async () => {
    const res = await request(app).get(
      "/api/chat-recharge/getAllChatPremiumPlans"
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.plans)).toBe(true);
  });

  it("POST /api/chat-recharge/validateChatPayment - should validate payment", async () => {
    const res = await request(app)
      .post("/api/chat-recharge/validateChatPayment")
      .send({
        paymentId: "pay_123",
        orderId: "order_123",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.paymentStatus).toBe("VALID");
  });

  it("POST /api/chat-recharge/validateCoupon - should validate coupon", async () => {
    const res = await request(app)
      .post("/api/chat-recharge/validateCoupon")
      .send({
        couponCode: "TEST10",
      });

    expect(res.statusCode).toBe(200);
  });

  it("GET /api/chat-recharge/getPremiumUserDetails/:userId - should return premium user details", async () => {
    const res = await request(app).get(
      `/api/chat-recharge/getPremiumUserDetails/${userId}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.isPremium).toBe(true);
  });
});
