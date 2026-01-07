import request from "supertest";
import app from "../../src/app.js";

/* ===========================
   MOCK MIDDLEWARES
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

jest.mock("../../src/validators/validate.js", () => ({
  validate: (req, res, next) => next(),
}));

/* ===========================
   MOCK CONTROLLERS
=========================== */

jest.mock("../../src/controllers/chat-app/chat.controllers.js", () => ({
  getAllChats: jest.fn((req, res) =>
    res.status(200).json({ success: true, chats: [] })
  ),

  getUnreadMessagesCount: jest.fn((req, res) =>
    res.status(200).json({ success: true, count: 5 })
  ),

  searchAvailableUsers: jest.fn((req, res) =>
    res.status(200).json({ success: true, users: [] })
  ),

  createOrGetAOneOnOneChat: jest.fn((req, res) =>
    res.status(201).json({ success: true, chatId: "chat123" })
  ),

  deleteOneOnOneChat: jest.fn((req, res) =>
    res.status(200).json({ success: true, message: "Chat deleted" })
  ),

  markMessageAsRead: jest.fn((req, res) =>
    res.status(200).json({ success: true })
  ),
}));

jest.mock("../../src/controllers/chat-app/getAllAgentController.js", () => ({
  getAllAgents: jest.fn((req, res) =>
    res.status(200).json({ success: true, agents: [] })
  ),
}));

/* ===========================
   TEST SUITE
=========================== */

describe("Chat Routes API", () => {
  it("GET /api/chats - should return all chats", async () => {
    const res = await request(app).get("/api/chats");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/chats/agents - should return agents", async () => {
    const res = await request(app).get("/api/chats/agents");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/chats/users - should return available users", async () => {
    const res = await request(app).get("/api/chats/users");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/chats/c/:receiverId - should create or get chat", async () => {
    const res = await request(app).post(
      "/api/chats/c/507f1f77bcf86cd799439012"
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.chatId).toBeDefined();
  });

  it("DELETE /api/chats/remove/:chatId - should delete chat", async () => {
    const res = await request(app).delete(
      "/api/chats/remove/507f1f77bcf86cd799439013"
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Chat deleted");
  });

  it("PUT /api/chats/messageread/:messageId/read - should mark message as read", async () => {
    const res = await request(app).put(
      "/api/chats/messageread/507f1f77bcf86cd799439014/read"
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/chats/messages/unread/count - should return unread count", async () => {
    const res = await request(app).get(
      "/api/chats/messages/unread/count"
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(5);
  });
});
