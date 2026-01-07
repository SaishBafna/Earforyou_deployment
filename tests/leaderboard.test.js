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
  "../../src/controllers/LeaderBord/userController.js",
  () => ({
    getUsersByServiceType: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        users: [],
      })
    ),

    getUserById: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        user: {
          _id: req.params.id,
          name: "Test User",
        },
      })
    ),

    filterByReview: jest.fn((req, res) =>
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

describe("Leaderboard User Routes API", () => {
  const userId = "507f1f77bcf86cd799439012";

  it("GET /api/users - should get users by service type", async () => {
    const res = await request(app)
      .get("/api/users")
      .query({ serviceType: "Mechanic" });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it("GET /api/user/:id - should get user by ID", async () => {
    const res = await request(app).get(`/api/user/${userId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user._id).toBe(userId);
  });

  it("GET /api/fillterbyreviwe - should filter users by review", async () => {
    const res = await request(app).get("/api/fillterbyreviwe");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
  });
});
