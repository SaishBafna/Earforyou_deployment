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

jest.mock("../../src/middlewares/multer.middlewares.js", () => ({
  upload: {
    fields: () => (req, res, next) => {
      req.files = {};
      next();
    },
  },
}));

jest.mock("../../src/validators/chat-app/message.validators.js", () => ({
  sendMessageValidator: () => (req, res, next) => next(),
}));

jest.mock("../../src/validators/common/mongodb.validators.js", () => ({
  mongoIdPathVariableValidator: () => (req, res, next) => next(),
}));

jest.mock("../../src/validators/validate.js", () => ({
  validate: (req, res, next) => next(),
}));

jest.mock("../../src/middlewares/auth/ChaeckChatUse.js", () => ({
  checkandcut: (req, res, next) => next(),
}));

jest.mock("../../src/middlewares/auth/checkChatStatus.js", () => ({
  checkChatStatus: (req, res, next) => next(),
}));

/* ===========================
   MOCK GROUP CHAT CONTROLLERS
=========================== */
jest.mock(
  "../../src/controllers/chat-app/GroupChat/GroupChat.js",
  () => ({
    getAllGroupChats: jest.fn((req, res) =>
      res.status(200).json({ success: true, groups: [] })
    ),

    getAllGroups: jest.fn((req, res) =>
      res.status(200).json({ success: true, groups: [] })
    ),

    createGroupChat: jest.fn((req, res) =>
      res.status(201).json({ success: true, groupId: "group123" })
    ),

    getGroupChatDetails: jest.fn((req, res) =>
      res.status(200).json({ success: true, group: { _id: req.params.chatId } })
    ),

    updateGroupChatDetails: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Group updated" })
    ),

    deleteGroupChat: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Group deleted" })
    ),

    addParticipantsToGroup: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Participants added" })
    ),

    removeParticipantFromGroup: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Participant removed" })
    ),

    leaveGroupChat: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Left group" })
    ),

    requestToJoinGroup: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Join request sent" })
    ),

    approveJoinRequest: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Join request approved" })
    ),

    getPendingJoinRequests: jest.fn((req, res) =>
      res.status(200).json({ success: true, requests: [] })
    ),

    getAllGroupMessages: jest.fn((req, res) =>
      res.status(200).json({ success: true, messages: [] })
    ),

    sendGroupMessage: jest.fn((req, res) =>
      res.status(201).json({ success: true, messageId: "msg123" })
    ),

    generateGroupInviteLink: jest.fn((req, res) =>
      res.status(200).json({ success: true, link: "invite_link" })
    ),

    joinGroupViaLink: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Joined group" })
    ),

    revokeGroupInviteLink: jest.fn((req, res) =>
      res.status(200).json({ success: true, message: "Invite revoked" })
    ),
  })
);

/* ===========================
   TEST SUITE
=========================== */

describe("Group Chat Routes API", () => {
  const chatId = "507f1f77bcf86cd799439012";

  it("GET /api/chat/group - get all group chats", async () => {
    const res = await request(app).get("/api/chat/group");
    expect(res.statusCode).toBe(200);
  });

  it("POST /api/chat/group - create group", async () => {
    const res = await request(app).post("/api/chat/group");
    expect(res.statusCode).toBe(201);
  });

  it("GET /api/chat/getAllGroups", async () => {
    const res = await request(app).get("/api/chat/getAllGroups");
    expect(res.statusCode).toBe(200);
  });

  it("GET /api/chat/group/:chatId", async () => {
    const res = await request(app).get(`/api/chat/group/${chatId}`);
    expect(res.statusCode).toBe(200);
  });

  it("PUT /api/chat/group/:chatId", async () => {
    const res = await request(app).put(`/api/chat/group/${chatId}`);
    expect(res.statusCode).toBe(200);
  });

  it("DELETE /api/chat/group/:chatId", async () => {
    const res = await request(app).delete(`/api/chat/group/${chatId}`);
    expect(res.statusCode).toBe(200);
  });

  it("GET /api/chat/group/:chatId/messages", async () => {
    const res = await request(app).get(`/api/chat/group/${chatId}/messages`);
    expect(res.statusCode).toBe(200);
  });

  it("POST /api/chat/group/:chatId/messages", async () => {
    const res = await request(app)
      .post(`/api/chat/group/${chatId}/messages`)
      .field("content", "Hello group");
    expect(res.statusCode).toBe(201);
  });

  it("POST /api/chat/group/:chatId/join", async () => {
    const res = await request(app).post(`/api/chat/group/${chatId}/join`);
    expect(res.statusCode).toBe(200);
  });

  it("GET /api/chat/group/:chatId/requests", async () => {
    const res = await request(app).get(`/api/chat/group/${chatId}/requests`);
    expect(res.statusCode).toBe(200);
  });

  it("POST /api/chat/:chatId/generate-link", async () => {
    const res = await request(app).post(`/api/chat/${chatId}/generate-link`);
    expect(res.statusCode).toBe(200);
  });

  it("POST /api/chat/join/:token", async () => {
    const res = await request(app).post(`/api/chat/join/token123`);
    expect(res.statusCode).toBe(200);
  });

  it("DELETE /api/chat/:chatId/revoke-link", async () => {
    const res = await request(app).delete(`/api/chat/${chatId}/revoke-link`);
    expect(res.statusCode).toBe(200);
  });

  it("GET /api/chat/check-access/:receiverId", async () => {
    const res = await request(app).get(`/api/chat/check-access/user123`);
    expect(res.statusCode).toBe(200);
  });
});
