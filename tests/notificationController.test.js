import {
  sendBulkNotification,
  sendPushNotification,
  getValidTokenCount
} from "../../src/controllers/notification/notificationController.js";

import User from "../../src/models/Users.js";
import { Chat } from "../../src/models/chat.modal.js";
import { ChatMessage } from "../../src/models/message.models.js";
import { getMessaging } from "firebase-admin/messaging";

/* ===========================
   MOCKS
=========================== */
jest.mock("../../src/models/Users.js");
jest.mock("../../src/models/chat.modal.js");
jest.mock("../../src/models/message.models.js");

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(),
}));

const sendEachForMulticast = jest.fn();

getMessaging.mockReturnValue({
  sendEachForMulticast,
});

/* ===========================
   MOCK RESPONSE
=========================== */
const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

describe("Notification Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ===========================
     sendBulkNotification
  =========================== */
  it("should send bulk notifications successfully", async () => {
    User.find.mockResolvedValue([
      { deviceToken: "token1" },
      { deviceToken: "token2" },
    ]);

    sendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [],
    });

    const req = {
      body: {
        title: "Test Title",
        body: "Test Body",
      },
    };

    const res = mockRes();

    await sendBulkNotification(req, res);

    expect(sendEachForMulticast).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Notifications sent",
      })
    );
  });

  it("should return 400 if title/body missing", async () => {
    const req = { body: {} };
    const res = mockRes();

    await sendBulkNotification(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should handle empty token list", async () => {
    User.find.mockResolvedValue([]);

    const req = {
      body: { title: "Hello", body: "World" },
    };
    const res = mockRes();

    await sendBulkNotification(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  /* ===========================
     sendPushNotification
  =========================== */
  it("should send push notification to a user", async () => {
    User.findById
      .mockResolvedValueOnce({
        _id: "senderId",
        username: "sender",
        avatarUrl: "avatar.png",
      })
      .mockResolvedValueOnce({
        _id: "receiverId",
        username: "receiver",
        deviceToken: "device-token",
      });

    Chat.findOne.mockResolvedValue({
      _id: "chatId",
    });

    ChatMessage.findOne.mockResolvedValue({
      _id: "messageId",
    });

    const req = {
      user: { _id: "senderId" },
      body: { userId: "receiverId" },
    };

    const res = mockRes();

    await sendPushNotification(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it("should fail if recipient has no device token", async () => {
    User.findById
      .mockResolvedValueOnce({ _id: "senderId" })
      .mockResolvedValueOnce({ _id: "receiverId" });

    const req = {
      user: { _id: "senderId" },
      body: { userId: "receiverId" },
    };

    const res = mockRes();

    await sendPushNotification(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  /* ===========================
     getValidTokenCount
  =========================== */
  it("should return valid token count", async () => {
    User.countDocuments.mockResolvedValue(2);
    User.find.mockResolvedValue([
      { username: "u1", deviceToken: "t1" },
      { username: "u2", deviceToken: "t2" },
    ]);

    const req = {};
    const res = mockRes();

    await getValidTokenCount(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        totalCount: 2,
      })
    );
  });

  it("should handle DB error in getValidTokenCount", async () => {
    User.countDocuments.mockRejectedValue(new Error("DB error"));

    const req = {};
    const res = mockRes();

    await getValidTokenCount(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
