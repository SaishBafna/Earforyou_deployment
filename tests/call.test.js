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
   MOCK CALL CONTROLLERS
=========================== */
jest.mock(
  "../../src/controllers/CallController/CallController.js",
  () => ({
    initiateCall: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Call initiated",
        callId: "call_123",
      })
    ),

    acceptCall: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Call accepted",
      })
    ),

    rejectCall: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Call rejected",
      })
    ),

    endCall: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Call ended",
      })
    ),

    handleMissedCall: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Missed call logged",
      })
    ),

    getRecentCalls: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        calls: [],
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Call Routes API", () => {
  it("GET /api/calls/recent-calls - should get recent calls (protected)", async () => {
    const res = await request(app).get("/api/calls/recent-calls");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.calls)).toBe(true);
  });

  it("POST /api/calls/initiate - should initiate a call", async () => {
    const res = await request(app)
      .post("/api/calls/initiate")
      .send({
        receiverId: "user_456",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.callId).toBeDefined();
  });

  it("POST /api/calls/accept - should accept a call", async () => {
    const res = await request(app)
      .post("/api/calls/accept")
      .send({
        callId: "call_123",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Call accepted");
  });

  it("POST /api/calls/reject - should reject a call", async () => {
    const res = await request(app)
      .post("/api/calls/reject")
      .send({
        callId: "call_123",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Call rejected");
  });

  it("POST /api/calls/end - should end a call", async () => {
    const res = await request(app)
      .post("/api/calls/end")
      .send({
        callId: "call_123",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Call ended");
  });

  it("POST /api/calls/missed - should log missed call", async () => {
    const res = await request(app)
      .post("/api/calls/missed")
      .send({
        callerId: "user_123",
        receiverId: "user_456",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Missed call logged");
  });
});
