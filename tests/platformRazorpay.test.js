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
  "../../src/controllers/Razorpay/PlatFromRazorPay.js",
  () => ({
    createOrder: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        order: {
          id: "order_123",
          amount: 999,
        },
      })
    ),

    verifyPayment: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Payment verified successfully",
      })
    ),

    handleWebhook: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Webhook handled successfully",
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Platform Razorpay Routes API", () => {
  describe("POST /api/razorpay/platfrom/create-order", () => {
    it("should create a Razorpay order", async () => {
      const res = await request(app)
        .post("/api/razorpay/platfrom/create-order")
        .send({
          planId: "plan_123",
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.order.id).toBe("order_123");
    });
  });

  describe("POST /api/razorpay/platfrom/verify", () => {
    it("should verify Razorpay payment", async () => {
      const res = await request(app)
        .post("/api/razorpay/platfrom/verify")
        .send({
          payment: {
            razorpay_payment_id: "pay_123",
            razorpay_order_id: "order_123",
            razorpay_signature: "signature_123",
          },
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Payment verified successfully");
    });
  });

  describe("POST /api/razorpay/platfrom/webhook", () => {
    it("should handle Razorpay webhook", async () => {
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_123",
            },
          },
        },
      };

      const res = await request(app)
        .post("/api/razorpay/platfrom/webhook")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Webhook handled successfully");
    });
  });
});
