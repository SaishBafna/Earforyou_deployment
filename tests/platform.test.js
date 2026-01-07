import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK CONTROLLERS
=========================== */

jest.mock(
  "../../src/controllers/Recharge/PlatfromChareges/Platfrom.js",
  () => ({
    createPlan: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        message: "Platform charge plan created",
        planId: "plan123",
      })
    ),

    getAllPlans: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        plans: [],
      })
    ),

    validatePayment: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        paymentStatus: "VALID",
      })
    ),

    getUserPlatformCharge: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        userId: req.params.userId,
        charge: 99,
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Platform Charges / Plans Routes API", () => {
  const userId = "507f1f77bcf86cd799439011";

  it("POST /api/platform/PlatfromChargesCreate - should create platform charge plan", async () => {
    const res = await request(app)
      .post("/api/platform/PlatfromChargesCreate")
      .send({
        name: "Standard Platform Fee",
        amount: 99,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.planId).toBeDefined();
  });

  it("GET /api/platform/PlatfromChargesGet - should get all platform charge plans", async () => {
    const res = await request(app).get(
      "/api/platform/PlatfromChargesGet"
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.plans)).toBe(true);
  });

  it("POST /api/platform/validatePayment - should validate payment", async () => {
    const res = await request(app)
      .post("/api/platform/validatePayment")
      .send({
        paymentId: "pay_123",
        orderId: "order_123",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.paymentStatus).toBe("VALID");
  });

  it("GET /api/platform/getUserPlatformCharge/:userId - should get user platform charge", async () => {
    const res = await request(app).get(
      `/api/platform/getUserPlatformCharge/${userId}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.charge).toBe(99);
  });
});
