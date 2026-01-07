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
jest.mock("../../src/controllers/Razorpay/Wallet.js", () => ({
  paymentService: {
    createOrder: jest.fn(() =>
      Promise.resolve({
        id: "order_123",
        amount: 499,
        originalAmount: 599,
        currency: "INR",
        key: "rzp_test_key",
        plan: {
          name: "Gold Plan",
          talkTime: 300,
          validity: 30,
        },
        coupon: null,
      })
    ),

    verifyAndAddTalkTime: jest.fn(() =>
      Promise.resolve({
        subscription: {
          id: "sub_123",
          status: "ACTIVE",
        },
        wallet: {
          balance: 300,
        },
        couponApplied: null,
      })
    ),

    handleWebhook: jest.fn(() => Promise.resolve()),
  },
}));

/* ===========================
   TEST SUITE
=========================== */

describe("Wallet Razorpay Routes API", () => {
  describe("POST /api/payments/wallet/create-order", () => {
    it("should create wallet order", async () => {
      const res = await request(app)
        .post("/api/payments/wallet/create-order")
        .send({
          planId: "plan_123",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe("order_123");
      expect(res.body.amount).toBe(499);
      expect(res.body.currency).toBe("INR");
      expect(res.body.plan.name).toBe("Gold Plan");
    });
  });

  describe("POST /api/payments/wallet/verify", () => {
    it("should verify payment and add talk time", async () => {
      const res = await request(app)
        .post("/api/payments/wallet/verify")
        .send({
          planId: "plan_123",
          paymentData: {
            razorpay_order_id: "order_123",
            razorpay_payment_id: "pay_123",
            razorpay_signature: "signature_123",
          },
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.subscription.status).toBe("ACTIVE");
      expect(res.body.wallet.balance).toBe(300);
    });
  });

  describe("POST /api/payments/wallet/webhook", () => {
    it("should process Razorpay webhook", async () => {
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
        .post("/api/payments/wallet/webhook")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload));

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});
