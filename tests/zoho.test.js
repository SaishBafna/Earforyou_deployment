import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK CONTROLLERS
=========================== */
jest.mock(
  "../../src/controllers/Zoho/ZohoController.js",
  () => ({
    generateAuthCode: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        authUrl: "https://accounts.zoho.com/oauth/v2/auth",
      })
    ),

    processCallback: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Zoho OAuth callback processed",
      })
    ),
  })
);

/* ===========================
   MOCK ZOHO SERVICE
=========================== */
jest.mock(
  "../../src/servises/ZohoServices.js",
  () => ({
    refreshAccessToken: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        accessToken: "zoho_access_token_123",
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Zoho OAuth Routes API", () => {
  it("GET /api/zoho/generate-auth-code - should generate auth code URL", async () => {
    const res = await request(app).get("/api/zoho/generate-auth-code");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.authUrl).toContain("zoho.com");
  });

  it("GET /api/zoho/callback - should process OAuth callback", async () => {
    const res = await request(app)
      .get("/api/zoho/callback")
      .query({
        code: "auth_code_123",
        state: "xyz",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Zoho OAuth callback processed");
  });

  it("GET /api/zoho/refreshAccessToken - should refresh access token", async () => {
    const res = await request(app).get("/api/zoho/refreshAccessToken");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
  });
});
