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
jest.mock("../../src/controllers/MoodController.js", () => ({
  createMood: jest.fn((req, res) =>
    res.status(201).json({
      success: true,
      message: "Mood created",
    })
  ),

  getMood: jest.fn((req, res) =>
    res.status(200).json({
      success: true,
      mood: "Happy",
    })
  ),

  getAllUserMoods: jest.fn((req, res) =>
    res.status(200).json({
      success: true,
      moods: [],
    })
  ),

  getMoodStatistics: jest.fn((req, res) =>
    res.status(200).json({
      success: true,
      stats: {},
    })
  ),

  updateMood: jest.fn((req, res) =>
    res.status(200).json({
      success: true,
      message: "Mood updated",
    })
  ),
}));

jest.mock("../../src/controllers/Streak.js", () => ({
  createStreak: jest.fn((req, res) =>
    res.status(201).json({
      success: true,
      message: "Streak created",
    })
  ),

  getStreak: jest.fn((req, res) =>
    res.status(200).json({
      success: true,
      streak: 7,
    })
  ),
}));

/* ===========================
   TEST SUITE
=========================== */

describe("Mood & Streak Routes API", () => {
  const userId = "507f1f77bcf86cd799439012";

  it("POST /api/mood/createMood - should create mood", async () => {
    const res = await request(app)
      .post("/api/mood/createMood")
      .send({ mood: "Happy" });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Mood created");
  });

  it("GET /api/mood/getMood - should get current mood", async () => {
    const res = await request(app).get("/api/mood/getMood");

    expect(res.statusCode).toBe(200);
    expect(res.body.mood).toBe("Happy");
  });

  it("GET /api/mood/getAllUserMoods/:userId - should get all moods of user", async () => {
    const res = await request(app).get(
      `/api/mood/getAllUserMoods/${userId}`
    );

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.moods)).toBe(true);
  });

  it("GET /api/mood/getMoodStatistics/:userId - should get mood statistics", async () => {
    const res = await request(app).get(
      `/api/mood/getMoodStatistics/${userId}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.stats).toBeDefined();
  });

  it("PUT /api/mood/updateMood - should update mood", async () => {
    const res = await request(app)
      .put("/api/mood/updateMood")
      .send({ mood: "Calm" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Mood updated");
  });

  it("POST /api/mood/createStreak - should create streak", async () => {
    const res = await request(app).post("/api/mood/createStreak");

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Streak created");
  });

  it("GET /api/mood/getStreak/:userId - should get streak", async () => {
    const res = await request(app).get(
      `/api/mood/getStreak/${userId}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.streak).toBe(7);
  });
});
