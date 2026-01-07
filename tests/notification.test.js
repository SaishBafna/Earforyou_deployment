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
  "../../src/controllers/firebase/FirebaseMessage.js",
  () => ({
    sendPushNotification: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Notification sent",
      })
    ),

    sendBulkNotification: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        message: "Bulk notifications sent",
      })
    ),

    getValidTokenCount: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        count: 120,
      })
    ),
  })
);

jest.mock(
  "../../src/controllers/firebase/GetNotificaton.js",
  () => ({
    getNotifications: jest.fn((req, res) =>
      res.status(200).json({
        success: true,
        notifications: [],
      })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Notification Routes API", () => {
  it("POST /api/notifications/send-notification - should send push notification", async () => {
    const res = await request(app)
      .post("/api/notifications/send-notification")
      .send({
        title: "Test Notification",
        body: "Hello user",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Notification sent");
  });

  it("GET /api/notifications/Notification - should get notifications", async () => {
    const res = await request(app).get(
      "/api/notifications/Notification"
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.notifications)).toBe(true);
  });

  it("POST /api/notifications/BulkNotification - should send bulk notifications", async () => {
    const res = await request(app)
      .post("/api/notifications/BulkNotification")
      .send({
        title: "Bulk Test",
        body: "Bulk message",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Bulk notifications sent");
  });

  it("GET /api/notifications/getValidTokenCount - should return valid token count", async () => {
    const res = await request(app).get(
      "/api/notifications/getValidTokenCount"
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(120);
  });
});
