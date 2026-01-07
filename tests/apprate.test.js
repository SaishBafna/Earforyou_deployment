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
   MOCK CONTROLLER
=========================== */

jest.mock("../../src/controllers/LeaderBord/Apprate.js", () => ({
  addRating: jest.fn((req, res) =>
    res.status(201).json({
      success: true,
      message: "Rating added successfully",
    })
  ),
}));

/* ===========================
   TEST SUITE
=========================== */

describe("App Rating Routes API", () => {
  it("POST /api/rating/comment - should add a rating", async () => {
    const res = await request(app)
      .post("/api/rating/comment")
      .send({
        rating: 5,
        comment: "Excellent app!",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Rating added successfully");
  });
});
