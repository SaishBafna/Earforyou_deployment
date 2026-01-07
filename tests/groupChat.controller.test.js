import mongoose from "mongoose";
import {
  checkGroupMessagePermissions,
  sendGroupMessage,
  createGroupChat,
  getAllGroupChats,
  generateGroupInviteLink,
  joinGroupViaLink,
  revokeGroupInviteLink,
} from "../../src/controllers/chat-app/GroupChat/GroupChat.js";

import { GroupChat } from "../../src/models/group/chat.models.js";
import { GroupChatMessage } from "../../src/models/group/message.models.js";
import User from "../../src/models/Users.js";
import { emitSocketEvent } from "../../src/socket/index.js";

/* ===========================
   GLOBAL MOCKS
=========================== */
jest.mock("../../src/models/group/chat.models.js");
jest.mock("../../src/models/group/message.models.js");
jest.mock("../../src/models/Users.js");

jest.mock("../../src/socket/index.js", () => ({
  emitSocketEvent: jest.fn(),
}));

jest.mock("../../src/utils/helpers.js", () => ({
  getStaticFilePath: jest.fn(() => "static/file.png"),
  getLocalPath: jest.fn(() => "/tmp/file.png"),
  removeLocalFile: jest.fn(),
}));

jest.mock("../../src/config/firebaseConfig.js", () => ({
  messaging: () => ({
    send: jest.fn(),
    sendEachForMulticast: jest.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    }),
  }),
}));

/* ===========================
   MOCK RESPONSE / NEXT
=========================== */
const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

const mockNext = jest.fn();

/* ===========================
   TESTS
=========================== */
describe("Group Chat Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ===========================
     checkGroupMessagePermissions
  =========================== */
  it("should allow admin to send message", async () => {
    GroupChat.findOne.mockResolvedValue({
      admins: [new mongoose.Types.ObjectId("user1")],
      settings: { sendMessagesPermission: "admins" },
    });

    const req = {
      params: { chatId: "chat1" },
      user: { _id: new mongoose.Types.ObjectId("user1") },
      files: {},
    };

    await checkGroupMessagePermissions(req, {}, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  /* ===========================
     createGroupChat
  =========================== */
  it("should create a group chat", async () => {
    User.find.mockResolvedValue([
      { _id: "user1" },
      { _id: "user2" },
      { _id: "user3" },
    ]);

    GroupChat.create.mockResolvedValue({ _id: "group1" });
    GroupChat.aggregate.mockResolvedValue([{ _id: "group1", participants: [] }]);

    const req = {
      body: {
        name: "Test Group",
        participants: ["user2", "user3"],
      },
      user: { _id: "user1" },
    };

    const res = mockRes();

    await createGroupChat(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(emitSocketEvent).toHaveBeenCalled();
  });

  /* ===========================
     sendGroupMessage
  =========================== */
  it("should send a group message", async () => {
    GroupChat.findOneAndUpdate.mockResolvedValue({
      _id: "group1",
      participants: [{ _id: "user2", deviceToken: "token" }],
      name: "Group",
    });

    GroupChatMessage.create.mockResolvedValue({ _id: "msg1" });
    GroupChat.bulkWrite.mockResolvedValue(true);
    GroupChatMessage.aggregate.mockResolvedValue([{ _id: "msg1" }]);

    User.findById.mockResolvedValue({
      username: "Sender",
      avatar: "avatar.png",
    });

    const req = {
      params: { chatId: "group1" },
      body: { content: "Hello group" },
      user: { _id: "user1" },
      files: {},
    };

    const res = mockRes();

    await sendGroupMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(emitSocketEvent).toHaveBeenCalled();
  });

  /* ===========================
     getAllGroupChats
  =========================== */
  it("should return group chats for user", async () => {
    GroupChat.aggregate.mockResolvedValue([]);
    GroupChat.countDocuments.mockResolvedValue(0);

    const req = {
      user: { _id: "user1" },
      query: {},
    };

    const res = mockRes();

    await getAllGroupChats(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* ===========================
     generateGroupInviteLink
  =========================== */
  it("should generate invite link", async () => {
    GroupChat.findOne.mockResolvedValue({
      settings: {},
      save: jest.fn(),
    });

    const req = {
      params: { chatId: "group1" },
      body: {},
      user: { _id: "user1" },
      protocol: "http",
      get: () => "localhost",
    };

    const res = mockRes();

    await generateGroupInviteLink(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* ===========================
     joinGroupViaLink
  =========================== */
  it("should join group via invite link", async () => {
    GroupChat.findOne.mockResolvedValue({
      participants: [],
      unreadCounts: [],
      save: jest.fn(),
      settings: {},
      _id: "group1",
    });

    GroupChatMessage.countDocuments.mockResolvedValue(0);
    GroupChat.aggregate.mockResolvedValue([{ _id: "group1", participants: [] }]);

    const req = {
      params: { token: "invite-token" },
      user: { _id: "user1" },
    };

    const res = mockRes();

    await joinGroupViaLink(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  /* ===========================
     revokeGroupInviteLink
  =========================== */
  it("should revoke invite link", async () => {
    GroupChat.findOneAndUpdate.mockResolvedValue({ _id: "group1" });

    const req = {
      params: { chatId: "group1" },
      user: { _id: "user1" },
    };

    const res = mockRes();

    await revokeGroupInviteLink(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
