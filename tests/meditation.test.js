import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK CONTROLLERS
=========================== */

jest.mock(
  "../../src/controllers/Meditation/MedController.js",
  () => ({
    getMeditations: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        meditations: [],
      })
    ),

    createMeditation: jest.fn((req, res) =>
      res.status(201).json({
        success: true,
        message: "Meditation created",
        meditationId: "med123",
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Meditation Routes API", () => {
  it("GET /api/meditations - should get all meditations", async () => {
    const res = await request(app).get("/api/meditations");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.meditations)).toBe(true);
  });

  it("POST /api/meditations - should create a meditation", async () => {
    const res = await request(app)
      .post("/api/meditations")
      .send({
        title: "Morning Calm",
        duration: 10,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.meditationId).toBeDefined();
  });
});
