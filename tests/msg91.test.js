import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK CONTROLLERS
=========================== */

jest.mock(
  "../../src/controllers/OTP/msg91Controller.js",
  () => ({
    sendOtp: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "OTP sent successfully",
      })
    ),

    retryOtp: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "OTP resent successfully",
      })
    ),

    verifyOtp: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        verified: true,
      })
    ),

    updateOtpTemplate: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "OTP template updated",
      })
    ),

    getAnalyticsReport: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        report: {},
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("MSG91 OTP Routes API", () => {
  it("POST /api/otp/send - should send OTP", async () => {
    const res = await request(app)
      .post("/api/otp/send")
      .send({
        phone: "7083057621",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("OTP sent successfully");
  });

  it("GET /api/otp/retry - should retry OTP", async () => {
    const res = await request(app)
      .get("/api/otp/retry")
      .query({ phone: "7083057621" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("OTP resent successfully");
  });

  it("GET /api/otp/verify - should verify OTP", async () => {
    const res = await request(app)
      .get("/api/otp/verify")
      .query({
        phone: "7083057621",
        otp: "1234",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.verified).toBe(true);
  });

  it("POST /api/otp/template/update - should update OTP template", async () => {
    const res = await request(app)
      .post("/api/otp/template/update")
      .send({
        template: "Your OTP is {{otp}}",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("OTP template updated");
  });

  it("GET /api/report/analytics - should get analytics report", async () => {
    const res = await request(app).get("/api/report/analytics");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.report).toBeDefined();
  });
});
