import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK CONTROLLERS
=========================== */
jest.mock(
  "../../src/controllers/BlockUser/BlockController.js",
  () => ({
    blockUser: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "User blocked successfully",
      })
    ),

    unblockUser: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "User unblocked successfully",
      })
    ),

    checkBlockStatus: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        isBlocked: false,
      })
    ),

    getBlockedUsers: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        users: [],
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Block User Routes API", () => {
  const userId = "507f1f77bcf86cd799439011";

  it("POST /api/block/block - should block a user", async () => {
    const res = await request(app)
      .post("/api/block/block")
      .send({
        userId: "user_123",
        blockedUserId: "user_456",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("User blocked successfully");
  });

  it("POST /api/block/unblock - should unblock a user", async () => {
    const res = await request(app)
      .post("/api/block/unblock")
      .send({
        userId: "user_123",
        blockedUserId: "user_456",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("User unblocked successfully");
  });

  it("GET /api/block/check - should check block status", async () => {
    const res = await request(app)
      .get("/api/block/check")
      .query({
        userId: "user_123",
        blockedUserId: "user_456",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isBlocked).toBe(false);
  });

  it("GET /api/block/blocked-users/:userId - should get blocked users list", async () => {
    const res = await request(app).get(
      `/api/block/blocked-users/${userId}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
  });
});
