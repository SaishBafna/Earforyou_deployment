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
   MOCK PAYMENT SERVICE
=========================== */

jest.mock(
  "../../src/controllers/Razorpay/ChatRazorpay.js",
  () => ({
    paymentService: {
      verifyWebhookSignature: jest.fn(() => Promise.resolve()),
      handleWebhook: jest.fn(() => Promise.resolve()),

      createOrder: jest.fn(() =>
        Promise.resolve({
          orderId: "order_123",
          amount: 499,
        })
      ),

      verifyAndActivate: jest.fn(() =>
        Promise.resolve({
          subscriptionId: "sub_123",
          status: "ACTIVE",
        })
      ),
    },
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Razorpay Chat Routes API", () => {
  describe("POST /api/razorpay/razorwebhook", () => {
    it("should process webhook successfully", async () => {
      const payload = {
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_123" } } },
      };

      const res = await request(app)
        .post("/api/razorpay/razorwebhook")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload));

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe("Webhook processed successfully");
    });
  });

  describe("POST /api/razorpay/create-order", () => {
    it("should create an order", async () => {
      const res = await request(app)
        .post("/api/razorpay/create-order")
        .send({
          planId: "plan_123",
          couponCode: "SAVE10",
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe("order_123");
    });
  });

  describe("POST /api/razorpay/verify", () => {
    it("should verify payment and activate subscription", async () => {
      const res = await request(app)
        .post("/api/razorpay/verify")
        .send({
          planId: "plan_123",
          payment: {
            razorpay_payment_id: "pay_123",
            razorpay_order_id: "order_123",
            razorpay_signature: "signature_123",
          },
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subscriptionId).toBe("sub_123");
      expect(res.body.data.status).toBe("ACTIVE");
    });
  });
});
