import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK AUTH MIDDLEWARE
=========================== */
jest.mock("../../src/middlewares/auth/authMiddleware.js", () => ({
  protect: (req, res, next) => {
    req.user = { _id: "507f1f77bcf86cd799439011", email: "test@example.com" };
    next();
  },
}));

/* ===========================
   MOCK CONTROLLERS
=========================== */
jest.mock(
  "../../src/controllers/Survey/Survey.Controller.js",
  () => ({
    createSurvey: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        message: "Survey created",
        surveyId: "survey123",
      })
    ),

    getSurveys: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        surveys: [],
      })
    ),

    getSurveyById: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        survey: {
          _id: req.params.id,
          title: "Test Survey",
        },
      })
    ),

    getSurveyStats: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        stats: {
          total: 10,
          responses: 7,
        },
      })
    ),

    getSurveysbyEmail: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        surveys: [],
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Survey Routes API", () => {
  const surveyId = "507f1f77bcf86cd799439012";

  it("POST /api/surveys - should create a survey", async () => {
    const res = await request(app)
      .post("/api/surveys")
      .send({
        title: "Customer Feedback",
        questions: [],
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.surveyId).toBeDefined();
  });

  it("GET /api/surveys - should get all surveys", async () => {
    const res = await request(app).get("/api/surveys");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.surveys)).toBe(true);
  });

  it("GET /api/surveys/:id - should get survey by ID", async () => {
    const res = await request(app).get(`/api/surveys/${surveyId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.survey._id).toBe(surveyId);
  });

  it("GET /api/surveys/stats - should get survey stats", async () => {
    const res = await request(app).get("/api/surveys/stats");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats.total).toBeDefined();
  });

  it("POST /api/surveys/getSurveysbyEmail - should get surveys by email", async () => {
    const res = await request(app)
      .post("/api/surveys/getSurveysbyEmail")
      .send({
        email: "test@example.com",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.surveys)).toBe(true);
  });
});
