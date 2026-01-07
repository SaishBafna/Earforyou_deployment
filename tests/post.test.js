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
   MOCK POST CONTROLLERS
=========================== */
jest.mock(
  "../../src/controllers/ThreadController/PostController.js",
  () => ({
    createPost: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        postId: "post123",
      })
    ),

    getPosts: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        posts: [],
      })
    ),

    getPersonalizedFeed: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        feed: [],
      })
    ),

    getPostById: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        post: { _id: req.params.id },
      })
    ),

    updatePost: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Post updated",
      })
    ),

    deletePost: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Post deleted",
      })
    ),

    toggleLikePost: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        liked: true,
      })
    ),

    getPostAnalytics: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        analytics: {},
      })
    ),
  })
);

/* ===========================
   MOCK COMMENT CONTROLLERS
=========================== */
jest.mock(
  "../../src/controllers/ThreadController/CommentController.js",
  () => ({
    createComment: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        commentId: "comment123",
      })
    ),

    getComments: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        comments: [],
      })
    ),

    updateComment: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Comment updated",
      })
    ),

    deleteComment: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Comment deleted",
      })
    ),

    toggleLikeComment: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        liked: true,
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Thread (Post & Comment) Routes API", () => {
  const postId = "507f1f77bcf86cd799439012";
  const commentId = "507f1f77bcf86cd799439013";

  /* -------- POSTS -------- */

  it("POST /api/posts - create post", async () => {
    const res = await request(app)
      .post("/api/posts")
      .send({ content: "Hello world" });

    expect(res.statusCode).toBe(201);
    expect(res.body.postId).toBeDefined();
  });

  it("GET /api/posts - get all posts", async () => {
    const res = await request(app).get("/api/posts");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
  });

  it("GET /api/posts/feed - get personalized feed", async () => {
    const res = await request(app).get("/api/posts/feed");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.feed)).toBe(true);
  });

  it("GET /api/posts/:id - get post by id", async () => {
    const res = await request(app).get(`/api/posts/${postId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.post._id).toBe(postId);
  });

  it("PUT /api/posts/:id - update post", async () => {
    const res = await request(app)
      .put(`/api/posts/${postId}`)
      .send({ content: "Updated content" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Post updated");
  });

  it("DELETE /api/posts/:id - delete post", async () => {
    const res = await request(app).delete(`/api/posts/${postId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Post deleted");
  });

  it("POST /api/posts/:id/like - like post", async () => {
    const res = await request(app).post(`/api/posts/${postId}/like`);

    expect(res.statusCode).toBe(200);
    expect(res.body.liked).toBe(true);
  });

  it("GET /api/posts/:id/analytics - get post analytics", async () => {
    const res = await request(app).get(`/api/posts/${postId}/analytics`);

    expect(res.statusCode).toBe(200);
    expect(res.body.analytics).toBeDefined();
  });

  /* -------- COMMENTS -------- */

  it("POST /api/posts/:postId/comments - create comment", async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ text: "Nice post" });

    expect(res.statusCode).toBe(201);
    expect(res.body.commentId).toBeDefined();
  });

  it("GET /api/posts/:postId/comments - get comments", async () => {
    const res = await request(app).get(`/api/posts/${postId}/comments`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.comments)).toBe(true);
  });

  it("PUT /api/posts/comments/:commentId - update comment", async () => {
    const res = await request(app)
      .put(`/api/posts/comments/${commentId}`)
      .send({ text: "Updated comment" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Comment updated");
  });

  it("DELETE /api/posts/comments/:commentId - delete comment", async () => {
    const res = await request(app).delete(
      `/api/posts/comments/${commentId}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Comment deleted");
  });

  it("POST /api/posts/comments/:commentId/like - like comment", async () => {
    const res = await request(app).post(
      `/api/posts/comments/${commentId}/like`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.liked).toBe(true);
  });
});
