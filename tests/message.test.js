import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK AUTH & MIDDLEWARES
=========================== */

jest.mock("../../src/middlewares/auth/authMiddleware.js", () => ({
  protect: (req, res, next) => {
    req.user = { _id: "507f1f77bcf86cd799439011" };
    next();
  },
}));

jest.mock("../../src/middlewares/auth/ChaeckChatUse.js", () => ({
  checkChatAccess: (req, res, next) => next(),
}));

jest.mock("../../src/middlewares/auth/checkChatStatus.js", () => ({
  checkChatStatus: (req, res, next) => next(),
}));

jest.mock("../../src/validators/common/mongodb.validators.js", () => ({
  mongoIdPathVariableValidator: () => (req, res, next) => next(),
}));

jest.mock("../../src/validators/chat-app/message.validators.js", () => ({
  sendMessageValidator: () => (req, res, next) => next(),
}));

jest.mock("../../src/validators/validate.js", () => ({
  validate: (req, res, next) => next(),
}));

/* ===========================
   MOCK MULTER
=========================== */

jest.mock("../../src/middlewares/multer.middlewares.js", () => ({
  upload: {
    fields: () => (req, res, next) => {
      req.files = {};
      next();
    },
  },
}));

/* ===========================
   MOCK CONTROLLERS
=========================== */

jest.mock("../../src/controllers/chat-app/message.controllers.js", () => ({
  getAllMessages: jest.fn((req, res) =>
    res.status(200).json({
      success: true,
      messages: [],
    })
  ),

  sendMessage: jest.fn((req, res) =>
    res.status(201).json({
      success: true,
      messageId: "msg123",
    })
  ),

  deleteMessage: jest.fn((req, res) =>
    res.status(200).json({
      success: true,
      message: "Message deleted",
    })
  ),
}));

/* ===========================
   TEST SUITE
=========================== */

describe("Message Routes API", () => {
  const chatId = "507f1f77bcf86cd799439012";
  const messageId = "507f1f77bcf86cd799439013";

  it("GET /api/messages/:chatId - should get all messages", async () => {
    const res = await request(app).get(`/api/messages/${chatId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it("POST /api/messages/:chatId - should send a message", async () => {
    const res = await request(app)
      .post(`/api/messages/${chatId}`)
      .field("content", "Hello World");

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.messageId).toBeDefined();
  });

  it("DELETE /api/messages/:chatId/:messageId - should delete a message", async () => {
    const res = await request(app).delete(
      `/api/messages/${chatId}/${messageId}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Message deleted");
  });
});
