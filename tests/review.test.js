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
  "../../src/controllers/LeaderBord/reviewController.js",
  () => ({
    createReview: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        message: "Review created",
        reviewId: "review123",
      })
    ),

    addCommentToReview: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        message: "Comment added",
      })
    ),

    updateReview: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Review updated",
      })
    ),

    deleteReview: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Review deleted",
      })
    ),

    getUserReviews: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        reviews: [],
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Review Routes API", () => {
  const userId = "507f1f77bcf86cd799439012";
  const reviewId = "507f1f77bcf86cd799439013";

  it("POST /api/reviews/:userId - should create a review", async () => {
    const res = await request(app)
      .post(`/api/reviews/${userId}`)
      .send({
        rating: 5,
        comment: "Great experience",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.reviewId).toBeDefined();
  });

  it("POST /api/reviews/:reviewId/comment - should add comment to review", async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewId}/comment`)
      .send({
        comment: "Thanks for the review!",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Comment added");
  });

  it("PUT /api/reviews/:reviewId - should update a review", async () => {
    const res = await request(app)
      .put(`/api/reviews/${reviewId}`)
      .send({
        rating: 4,
        comment: "Updated comment",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Review updated");
  });

  it("DELETE /api/reviews/:reviewId - should delete a review", async () => {
    const res = await request(app).delete(`/api/reviews/${reviewId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Review deleted");
  });

  it("GET /api/reviews/:user - should get user reviews", async () => {
    const res = await request(app).get(`/api/reviews/${userId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.reviews)).toBe(true);
  });
});
