import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK CONTROLLERS
=========================== */
jest.mock("../../src/controllers/Getway.js", () => ({
  getPaymentGateway: jest.fn((req, res) =>
    res.status(200).json({
      success: true,
      gateway: {
        name: "Razorpay",
        isActive: true,
      },
    })
  ),

  createOrUpdateGateway: jest.fn((req, res) =>
    res.status(201).json({
      success: true,
      message: "Payment gateway saved successfully",
    })
  ),
}));

/* ===========================
   TEST SUITE
=========================== */

describe("Payment Gateway Routes API", () => {
  it("GET /api/gateway - should get payment gateway config", async () => {
    const res = await request(app).get("/api/gateway");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.gateway.name).toBe("Razorpay");
    expect(res.body.gateway.isActive).toBe(true);
  });

  it("POST /api/gateway - should create or update payment gateway", async () => {
    const res = await request(app)
      .post("/api/gateway")
      .send({
        name: "Razorpay",
        key: "rzp_test_key",
        isActive: true,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe(
      "Payment gateway saved successfully"
    );
  });
});
