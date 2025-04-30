import mongoose from "mongoose";
import crypto from "crypto";
import { ChatEventEnum } from "../../../constants.js";
import User from "../../../models/Users.js";
import { GroupChat } from "../../../models/group/chat.models.js";
import { GroupChatMessage } from "../../../models/group/message.models.js";
import { emitSocketEvent } from "../../../socket/index.js";
import { ApiError } from "../../../utils/ApiError.js";
import { ApiResponse } from "../../../utils/ApiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { getLocalPath, getStaticFilePath, removeLocalFile } from "../../../utils/helpers.js";
import admin from "../../../config/firebaseConfig.js";

/**
 * Middleware to check if a user has permission to send messages in a group chat
 */
 const checkGroupMessagePermissions = asyncHandler(async (req, res, next) => {
  const { chatId } = req.params;
  const userId = req.user._id;
  const hasAttachments = req.files?.attachments?.length > 0;

  const groupChat = await GroupChat.findOne({
    _id: chatId,
    isGroupChat: true,
    participants: userId,
  }).select("participants admins settings.sendMessagesPermission settings.sendMediaPermission");

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  const isAdmin = groupChat.admins.some((adminId) => adminId.equals(userId));
  const sendMessagesPermission = groupChat.settings?.sendMessagesPermission || "all";

  if (sendMessagesPermission === "admins" && !isAdmin) {
    throw new ApiError(403, "Only admins can send messages in this group");
  }

  if (sendMessagesPermission === "none") {
    throw new ApiError(403, "Message sending is disabled in this group");
  }

  if (hasAttachments) {
    const sendMediaPermission = groupChat.settings?.sendMediaPermission || "all";

    if (sendMediaPermission === "admins" && !isAdmin) {
      throw new ApiError(403, "Only admins can send attachments in this group");
    }

    if (sendMediaPermission === "none") {
      throw new ApiError(403, "Attachment sending is disabled in this group");
    }
  }

  next();
});

// Common aggregation pipeline for chat queries
const chatCommonAggregation = (userId) => [
  {
    $lookup: {
      from: "users",
      localField: "participants",
      foreignField: "_id",
      as: "participants",
      pipeline: [{ $project: { username: 1, avatar: 1, email: 1 } }],
    },
  },
  {
    $lookup: {
      from: "groupchatmessages",
      localField: "lastMessage",
      foreignField: "_id",
      as: "lastMessage",
      pipeline: [
        {
          $lookup: {
            from: "users",
            localField: "sender",
            foreignField: "_id",
            as: "sender",
            pipeline: [{ $project: { username: 1, avatar: 1, email: 1 } }],
          },
        },
        { $unwind: "$sender" },
      ],
    },
  },
  { $unwind: { path: "$lastMessage", preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: "users",
      localField: "admins",
      foreignField: "_id",
      as: "admins",
      pipeline: [{ $project: { username: 1, avatar: 1, email: 1 } }],
    },
  },
  {
    $lookup: {
      from: "users",
      localField: "createdBy",
      foreignField: "_id",
      as: "createdBy",
      pipeline: [{ $project: { username: 1, avatar: 1, email: 1 } }],
    },
  },
  { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      sortField: { $ifNull: ["$lastMessage.createdAt", "$createdAt"] },
    },
  },
];

// Helper function to delete all messages and attachments for a chat
const deleteCascadeChatMessages = async (chatId) => {
  const messages = await GroupChatMessage.find({ chat: chatId })
    .select("attachments")
    .lean();

  const fileDeletions = messages.flatMap((message) =>
    message.attachments
      .filter((attachment) => attachment.localPath)
      .map((attachment) => removeLocalFile(attachment.localPath))
  );

  await Promise.all([
    ...fileDeletions,
    GroupChatMessage.deleteMany({ chat: chatId }),
  ]);
};

// Helper function to get paginated messages
const getPaginatedMessages = async (chatId, userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const [messages, totalCount] = await Promise.all([
    GroupChatMessage.aggregate([
      {
        $match: {
          chat: new mongoose.Types.ObjectId(chatId),
          deletedFor: { $ne: userId },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "_id",
          as: "sender",
          pipeline: [{ $project: { username: 1, avatar: 1, email: 1 } }],
        },
      },
      { $unwind: "$sender" },
      {
        $project: {
          content: 1,
          attachments: 1,
          createdAt: 1,
          updatedAt: 1,
          sender: 1,
          isRead: 1,
          seenBy: 1,
          edited: 1,
          replyTo: 1,
          reactions: 1,
        },
      },
    ]),
    GroupChatMessage.countDocuments({
      chat: chatId,
      deletedFor: { $ne: userId },
    }),
  ]);

  return {
    messages,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    page,
    limit,
  };
};

/**
 * @route GET /api/v1/chats/group
 * @description Get all group chats (joined and not joined) with unread counts and pagination
 */
const getAllGroups = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;

  // Parse and validate pagination parameters
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
    throw new ApiError(400, "Invalid page or limit parameters");
  }

  const skip = (pageNum - 1) * limitNum;

  // Build match stage for aggregation
  const matchStage = {
    isGroupChat: true,
    ...(search && { name: { $regex: search.trim(), $options: "i" } }),
  };

  // Run aggregation and count in parallel
  const [groupChats, totalCount] = await Promise.all([
    GroupChat.aggregate([
      { $match: matchStage },
      {
        $addFields: {
          isJoined: { $in: [req.user._id, "$participants"] },
          unreadCount: {
            $ifNull: [
              {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$unreadCounts",
                      as: "uc",
                      cond: { $eq: ["$$uc.user", req.user._id] },
                    },
                  },
                  0,
                ],
              },
              { count: 0 },
            ],
          },
        },
      },
      {
        $addFields: {
          unreadCount: "$unreadCount.count",
        },
      },
      ...chatCommonAggregation(req.user._id),
      { $sort: { sortField: -1 } },
      { $skip: skip },
      { $limit: limitNum },
      {
        $project: {
          name: 1,
          avatar: 1,
          participants: 1,
          admins: 1,
          createdBy: 1,
          lastMessage: 1,
          unreadCount: 1,
          createdAt: 1,
          lastActivity: 1,
          isJoined: 1,
        },
      },
    ]),
    GroupChat.countDocuments(matchStage),
  ]);

  // Calculate total pages
  const totalPages = Math.ceil(totalCount / limitNum);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        groupChats,
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
      },
      "Group chats fetched successfully"
    )
  );
});

/**
 * @route GET /api/v1/chats/group
 * @description Get all group chats for the current user with unread counts and pagination
 */
const getAllGroupChats = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
    throw new ApiError(400, "Invalid page or limit parameters");
  }

  const skip = (pageNum - 1) * limitNum;

  const matchStage = {
    isGroupChat: true,
    participants: req.user._id,
    ...(search && { name: { $regex: search.trim(), $options: "i" } }),
  };

  const [groupChats, totalCount] = await Promise.all([
    GroupChat.aggregate([
      { $match: matchStage },
      {
        $addFields: {
          unreadCount: {
            $ifNull: [
              {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$unreadCounts",
                      as: "uc",
                      cond: { $eq: ["$$uc.user", req.user._id] },
                    },
                  },
                  0,
                ],
              },
              { count: 0 },
            ],
          },
        },
      },
      {
        $addFields: {
          unreadCount: "$unreadCount.count",
        },
      },
      ...chatCommonAggregation(req.user._id),
      { $sort: { sortField: -1 } },
      { $skip: skip },
      { $limit: limitNum },
      {
        $project: {
          name: 1,
          avatar: 1,
          participants: 1,
          admins: 1,
          createdBy: 1,
          lastMessage: 1,
          unreadCount: 1,
          createdAt: 1,
          lastActivity: 1,
        },
      },
    ]),
    GroupChat.countDocuments(matchStage),
  ]);

  const totalPages = Math.ceil(totalCount / limitNum);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        groupChats,
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
      },
      "Group chats fetched successfully"
    )
  );
});

/**
 * @route POST /api/v1/chats/group/:chatId/messages
 * @description Send a message to a group chat
 */
const sendGroupMessage = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { content, replyTo } = req.body;

  if (!content && !req.files?.attachments?.length) {
    throw new ApiError(400, "Message content or attachment is required");
  }

  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    throw new ApiError(400, "Invalid chat ID format");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [groupChat, sender] = await Promise.all([
      GroupChat.findOne({
        _id: chatId,
        isGroupChat: true,
        participants: req.user._id,
      })
        .session(session)
        .populate({
          path: "participants",
          select: "_id username name deviceToken isOnline notificationSettings",
          match: { _id: { $ne: req.user._id } },
        }),
      User.findById(req.user._id).select("username name avatar").lean(),
    ]);

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found or you're not a participant");
    }

    const messageFiles = req.files?.attachments
      ? await Promise.all(
          req.files.attachments.map(async (attachment) => {
            try {
              const fileData = {
                url: getStaticFilePath(req, attachment.filename),
                localPath: getLocalPath(attachment.filename),
                fileType: attachment.mimetype.split("/")[0] || "other",
                fileName: attachment.originalname,
                size: attachment.size,
              };
              return fileData;
            } catch (error) {
              console.error("Error processing attachment:", error);
              return null;
            }
          })
        ).then((files) => files.filter(Boolean))
      : [];

    const messageData = {
      sender: req.user._id,
      content: content || "",
      chat: chatId,
      attachments: messageFiles,
    };

    if (replyTo) {
      if (!mongoose.Types.ObjectId.isValid(replyTo)) {
        throw new ApiError(400, "Invalid replyTo message ID format");
      }
      const repliedMessage = await GroupChatMessage.findOne({
        _id: replyTo,
        chat: chatId,
      })
        .select("sender content attachments createdAt")
        .lean({ session });
      if (!repliedMessage) {
        throw new ApiError(400, "Replied message not found in this chat");
      }
      messageData.replyTo = {
        messageId: repliedMessage._id,
        sender: repliedMessage.sender,
        content: repliedMessage.content,
        attachments: repliedMessage.attachments?.map((att) => ({
          url: att.url,
          fileType: att.fileType,
          thumbnailUrl: att.thumbnailUrl,
        })) || [],
        originalCreatedAt: repliedMessage.createdAt,
      };
    }

    const [createdMessage] = await GroupChatMessage.create([messageData], { session });

    const participantsToUpdate = groupChat.participants
      .filter((p) => !p._id.equals(req.user._id))
      .map((p) => p._id.toString());

    await GroupChat.findByIdAndUpdate(
      chatId,
      {
        $set: { lastMessage: createdMessage._id, lastActivity: new Date() },
        $push: {
          unreadCounts: {
            $each: participantsToUpdate
              .filter(
                (p) =>
                  !groupChat.unreadCounts.some((uc) => uc.user.toString() === p)
              )
              .map((p) => ({ user: p, count: 1 })),
          },
        },
        $inc: participantsToUpdate.reduce(
          (acc, p) => ({
            ...acc,
            [`unreadCounts.$[elem${p}].count`]: 1,
          }),
          {}
        ),
      },
      {
        arrayFilters: participantsToUpdate.map((p) => ({
          [`elem${p}.user`]: new mongoose.Types.ObjectId(p),
        })),
        session,
      }
    );

    await session.commitTransaction();

    const populatedMessage = await GroupChatMessage.aggregate([
      { $match: { _id: createdMessage._id } },
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "_id",
          as: "sender",
          pipeline: [{ $project: { username: 1, avatar: 1, email: 1, name: 1 } }],
        },
      },
      { $unwind: "$sender" },
      {
        $lookup: {
          from: "groupchatmessages",
          localField: "replyTo.messageId",
          foreignField: "_id",
          as: "replyToMessage",
          pipeline: [
            {
              $lookup: {
                from: "users",
                localField: "sender",
                foreignField: "_id",
                as: "sender",
                pipeline: [{ $project: { username: 1, avatar: 1 } }],
              },
            },
            { $unwind: "$sender" },
            { $project: { content: 1, sender: 1, attachments: 1, createdAt: 1 } },
          ],
        },
      },
      { $unwind: { path: "$replyToMessage", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          replyTo: {
            $cond: {
              if: { $ifNull: ["$replyTo", false] },
              then: {
                messageId: "$replyTo.messageId",
                sender: "$replyTo.sender",
                content: "$replyTo.content",
                attachments: "$replyTo.attachments",
                originalCreatedAt: "$replyTo.originalCreatedAt",
                repliedMessage: "$replyToMessage",
              },
              else: null,
            },
          },
        },
      },
      { $project: { replyToMessage: 0 } },
    ]).then((res) => res[0]);

    if (!populatedMessage) {
      throw new ApiError(500, "Failed to populate message after creation");
    }

    const senderName = sender.name || sender.username;
    const notificationMessage = content
      ? `${senderName}: ${content.substring(0, 50)}${content.length > 50 ? "..." : ""}`
      : messageFiles.length > 0
      ? `${senderName} sent a file`
      : "";
    const notificationData = {
      title: groupChat.name || "Group Chat",
      body: notificationMessage,
      data: {
        chatId: chatId.toString(),
        messageId: createdMessage._id.toString(),
        type: "group_message",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        senderId: req.user._id.toString(),
        senderName: senderName,
        ...(messageFiles.length > 0 && {github: "true" }),
      },
      icon: sender.avatar || null,
    };

    const { participantsToNotify, onlineParticipants } = groupChat.participants.reduce(
      (acc, participant) => {
        if (participant._id.toString() === req.user._id.toString()) {
          return acc;
        }
        if (!participant.deviceToken) {
          console.log(`User ${participant._id} has no device token`);
          return acc;
        }
        if (participant.notificationSettings?.groupChats === "none") {
          return acc;
        }
        if (
          participant.notificationSettings?.groupChats === "mentions_only" &&
          !content?.includes(`@${participant.username}`)
        ) {
          return acc;
        }
        if (participant.isOnline) {
          acc.onlineParticipants.push(participant);
        } else {
          acc.participantsToNotify.push(participant);
        }
        return acc;
      },
      { participantsToNotify: [], onlineParticipants: [] }
    );

    await Promise.all([
      ...participantsToNotify.map((participant) =>
        admin
          .messaging()
          .send({
            notification: {
              title: notificationData.title,
              body: notificationData.body,
            },
            token: participant.deviceToken,
            data: notificationData.data,
          })
          .catch((error) => {
            console.error(`Failed to send notification to user ${participant._id}:`, error);
          })
      ),
      ...onlineParticipants.map((participant) =>
        emitSocketEvent(
          req,
          participant._id.toString(),
          ChatEventEnum.MESSAGE_RECEIVED_EVENT,
          populatedMessage
        ).catch((error) => {
          console.error(`Failed to emit socket event to user ${participant._id}:`, error);
        })
      ),
    ]);

    return res
      .status(201)
      .json(new ApiResponse(201, populatedMessage, "Message sent successfully"));
  } catch (error) {
    await session.abortTransaction();
    console.error("Error in sendGroupMessage:", {
      error: error.message,
      stack: error.stack,
      chatId,
      userId: req.user._id,
    });
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route GET /api/v1/chats/group/:chatId/messages
 * @description Get all messages for a group chat with pagination
 */
const getAllGroupMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  let { page = 1, limit = 20 } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);

  if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
    throw new ApiError(400, "Invalid page or limit parameters");
  }

  const isParticipant = await GroupChat.exists({
    _id: chatId,
    isGroupChat: true,
    participants: req.user._id,
  });

  if (!isParticipant) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { messages, totalCount, totalPages } = await getPaginatedMessages(
      chatId,
      req.user._id,
      page,
      limit
    );

    await Promise.all([
      GroupChatMessage.updateMany(
        {
          chat: chatId,
          seenBy: { $ne: req.user._id },
          sender: { $ne: req.user._id },
        },
        {
          $addToSet: { seenBy: req.user._id },
          $set: { isRead: true },
        },
        { session }
      ),
      GroupChat.updateOne(
        { _id: chatId, "unreadCounts.user": req.user._id },
        { $set: { "unreadCounts.$.count": 0 } },
        { session }
      ),
    ]);

    await session.commitTransaction();

    return res.status(200).json(
      new ApiResponse(
        200,
        { messages, page, limit, totalCount, totalPages },
        "Group messages fetched successfully"
      )
    );
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route GET /api/v1/chats/group/:chatId
 * @description Get group chat details with paginated messages
 */
const getGroupChatDetails = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  let { page = 1, limit = 20 } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);

  if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
    throw new ApiError(400, "Invalid page or limit parameters");
  }

  const [groupChat] = await GroupChat.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(chatId),
        isGroupChat: true,
        participants: req.user._id,
      },
    },
    {
      $addFields: {
        unreadCount: {
          $ifNull: [
            {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$unreadCounts",
                    as: "uc",
                    cond: { $eq: ["$$uc.user", req.user._id] },
                  },
                },
                0,
              ],
            },
            { count: 0 },
          ],
        },
      },
    },
    {
      $addFields: {
        unreadCount: "$unreadCount.count",
      },
    },
    ...chatCommonAggregation(req.user._id),
  ]);

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { messages, totalCount, totalPages } = await getPaginatedMessages(
      chatId,
      req.user._id,
      page,
      limit
    );

    await Promise.all([
      GroupChatMessage.updateMany(
        {
          chat: chatId,
          seenBy: { $ne: req.user._id },
          sender: { $ne: req.user._id },
        },
        {
          $addToSet: { seenBy: req.user._id },
          $set: { isRead: true },
        },
        { session }
      ),
      GroupChat.updateOne(
        { _id: chatId, "unreadCounts.user": req.user._id },
        { $set: { "unreadCounts.$.count": 0 } },
        { session }
      ),
    ]);

    await session.commitTransaction();

    return res.status(200).json(
      new ApiResponse(
        200,
        { ...groupChat, messages, page, limit, totalCount, totalPages },
        "Group chat details fetched successfully"
      )
    );
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route POST /api/v1/chats/group
 * @description Create a new group chat
 */
const createGroupChat = asyncHandler(async (req, res) => {
  const { name, participants, avatar } = req.body;

  if (!name?.trim() || !Array.isArray(participants) || participants.length < 2) {
    throw new ApiError(400, "Name and at least two participants are required");
  }

  const participantIds = [...new Set([req.user._id, ...participants.map((id) => new mongoose.Types.ObjectId(id))])];

  const users = await User.find({ _id: { $in: participantIds } }).select("_id deviceToken");
  if (users.length !== participantIds.length) {
    throw new ApiError(404, "One or more users not found");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.create(
      [
        {
          name: name.trim(),
          isGroupChat: true,
          avatar: avatar || null,
          participants: participantIds,
          admins: [req.user._id],
          createdBy: req.user._id,
          unreadCounts: participantIds
            .filter((id) => !id.equals(req.user._id))
            .map((user) => ({ user, count: 1 })),
          lastActivity: new Date(),
        },
      ],
      { session }
    );

    const [createdGroupChat] = await GroupChat.aggregate([
      { $match: { _id: groupChat[0]._id } },
      ...chatCommonAggregation(req.user._id),
    ]);

    if (!createdGroupChat) {
      throw new ApiError(500, "Failed to create group chat");
    }

    await session.commitTransaction();

    const socketNotifications = createdGroupChat.participants
      .filter((p) => !p._id.equals(req.user._id))
      .map((participant) =>
        emitSocketEvent(req, participant._id.toString(), ChatEventEnum.NEW_GROUP_CHAT_EVENT, createdGroupChat).catch(
          (error) => {
            console.error("Socket notification failed:", error);
          }
        )
      );

    const pushNotifications = users
      .filter((user) => !user._id.equals(req.user._id) && user.deviceToken)
      .map(async (user) => {
        try {
          const message = {
            notification: {
              title: "New Group Chat",
              body: `You've been added to the group "${name.trim()}"`,
            },
            token: user.deviceToken,
            data: {
              chatId: createdGroupChat._id.toString(),
              type: "group_chat_created",
            },
          };
          await admin.messaging().send(message);
        } catch (error) {
          console.error("Failed to send FCM notification to user:", user._id, error);
        }
      });

    await Promise.allSettled([...socketNotifications, ...pushNotifications]);

    return res.status(201).json(new ApiResponse(201, createdGroupChat, "Group chat created successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route PUT /api/v1/chats/group/:chatId
 * @description Update group chat details (name, description)
 */
const updateGroupChatDetails = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { name, description } = req.body;

  if (!name?.trim() && !description?.trim()) {
    throw new ApiError(400, "At least one field to update is required");
  }

  const updateFields = {};
  if (name?.trim()) updateFields.name = name.trim();
  if (description?.trim()) updateFields.description = description.trim();
  updateFields.lastActivity = new Date();

  const updatedGroupChat = await GroupChat.findOneAndUpdate(
    { _id: chatId, isGroupChat: true, admins: req.user._id },
    { $set: updateFields },
    { new: true, lean: true }
  );

  if (!updatedGroupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  const notificationEvents = updatedGroupChat.participants.map((pId) =>
    emitSocketEvent(req, pId.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedGroupChat)
  );

  await Promise.all(notificationEvents);

  await sendGroupNotifications(req, {
    chatId,
    participants: updatedGroupChat.participants.map((p) => p._id),
    eventType: ChatEventEnum.UPDATE_GROUP_EVENT,
    data: updatedGroupChat,
  });

  return res.status(200).json(new ApiResponse(200, updatedGroupChat, "Group updated successfully"));
});

/**
 * @route PUT /api/v1/chats/group/:chatId/add
 * @description Add participants to a group chat
 */
const addParticipantsToGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { participants } = req.body;

  if (!Array.isArray(participants) || participants.length === 0) {
    throw new ApiError(400, "Participants array is required");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.findOne({
      _id: chatId,
      isGroupChat: true,
      admins: req.user._id,
    })
      .lean()
      .session(session);

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    const newParticipants = participants
      .map((id) => new mongoose.Types.ObjectId(id))
      .filter((p) => !groupChat.participants.some((existing) => existing.equals(p)));

    if (newParticipants.length === 0) {
      throw new ApiError(400, "All users are already in the group");
    }

    const usersCount = await User.countDocuments({ _id: { $in: newParticipants } }, { session });
    if (usersCount !== newParticipants.length) {
      throw new ApiError(404, "One or more users not found");
    }

    const unreadCounts = await GroupChatMessage.aggregate([
      {
        $match: {
          chat: new mongoose.Types.ObjectId(chatId),
          sender: { $nin: newParticipants },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      },
    ]);

    const totalUnread = unreadCounts[0]?.count || 0;

    const updatedGroupChat = await GroupChat.findByIdAndUpdate(
      chatId,
      {
        $addToSet: { participants: { $each: newParticipants } },
        $push: {
          unreadCounts: {
            $each: newParticipants.map((user) => ({ user, count: totalUnread })),
          },
        },
        $set: { lastActivity: new Date() },
      },
      { new: true, lean: true, session }
    );

    await session.commitTransaction();

    const notificationEvents = [
      ...groupChat.participants.map((pId) =>
        emitSocketEvent(req, pId.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedGroupChat)
      ),
      ...newParticipants.map((pId) =>
        emitSocketEvent(req, pId.toString(), ChatEventEnum.NEW_GROUP_CHAT_EVENT, updatedGroupChat)
      ),
    ];

    await Promise.all(notificationEvents);

    return res.status(200).json(new ApiResponse(200, updatedGroupChat, "Participants added successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route PUT /api/v1/chats/group/:chatId/remove
 * @description Remove participant from group chat
 */
const removeParticipantFromGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { participantId } = req.body;

  if (!participantId) {
    throw new ApiError(400, "Participant ID is required");
  }

  let participantObjectId;
  try {
    participantObjectId = new mongoose.Types.ObjectId(participantId);
  } catch (err) {
    throw new ApiError(400, "Invalid participant ID format");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.findOne({
      _id: chatId,
      isGroupChat: true,
      admins: req.user._id,
    })
      .lean()
      .session(session);

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    if (!groupChat.participants.some((p) => p.equals(participantObjectId))) {
      throw new ApiError(400, "User is not in this group");
    }

    if (participantObjectId.equals(req.user._id)) {
      throw new ApiError(400, "Use leave group endpoint instead");
    }

    const updatedGroupChat = await GroupChat.findByIdAndUpdate(
      chatId,
      {
        $pull: {
          participants: participantObjectId,
          admins: participantObjectId,
          unreadCounts: { user: participantObjectId },
        },
        $set: { lastActivity: new Date() },
      },
      { new: true, lean: true, session }
    );

    await session.commitTransaction();

    await Promise.all([
      ...updatedGroupChat.participants.map((pId) =>
        emitSocketEvent(req, pId.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedGroupChat)
      ),
      emitSocketEvent(req, participantId, ChatEventEnum.REMOVED_FROM_GROUP_EVENT, {
        chatId,
        removedBy: req.user._id,
      }),
    ]);

    await sendGroupNotifications(req, {
      chatId,
      participants: updatedGroupChat.participants.map((p) => p._id),
      eventType: ChatEventEnum.UPDATE_GROUP_EVENT,
      data: updatedGroupChat,
    });

    await sendGroupNotifications(req, {
      chatId,
      participants: [participantObjectId],
      eventType: ChatEventEnum.REMOVED_FROM_GROUP_EVENT,
      data: {
        chatId,
        removedBy: req.user._id,
        groupName: groupChat.name,
      },
    });

    return res.status(200).json(new ApiResponse(200, updatedGroupChat, "Participant removed successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route PUT /api/v1/chats/group/:chatId/leave
 * @description Leave a group chat
 */
const leaveGroupChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.findOne({
      _id: chatId,
      isGroupChat: true,
      participants: req.user._id,
    })
      .lean()
      .session(session);

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found or you're not a participant");
    }

    const otherParticipants = groupChat.participants.filter((p) => !p.equals(req.user._id));

    if (otherParticipants.length === 0) {
      await Promise.all([
        GroupChat.findByIdAndDelete(chatId, { session }),
        deleteCascadeChatMessages(chatId),
      ]);

      await session.commitTransaction();

      return res.status(200).json(new ApiResponse(200, {}, "Group deleted as last participant left"));
    }

    const isLastAdmin = groupChat.admins.length === 1 && groupChat.admins[0].equals(req.user._id);

    const update = {
      $pull: {
        participants: req.user._id,
        unreadCounts: { user: req.user._id },
      },
      $set: { lastActivity: new Date() },
    };

    if (isLastAdmin && otherParticipants.length > 0) {
      update.$addToSet = { admins: otherParticipants[0] };
    }

    const updatedGroupChat = await GroupChat.findByIdAndUpdate(chatId, update, { new: true, lean: true, session });

    await session.commitTransaction();

    await Promise.all([
      ...updatedGroupChat.participants.map((pId) =>
        emitSocketEvent(req, pId.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedGroupChat)
      ),
      emitSocketEvent(req, req.user._id.toString(), ChatEventEnum.LEFT_GROUP_EVENT, { chatId }),
    ]);

    return res.status(200).json(new ApiResponse(200, {}, "Left group successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route DELETE /api/v1/chats/group/:chatId
 * @description Delete a group chat (admin only)
 */
const deleteGroupChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.findOneAndDelete(
      {
        _id: chatId,
        isGroupChat: true,
        admins: req.user._id,
      },
      { session }
    ).lean();

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    await deleteCascadeChatMessages(chatId);

    await session.commitTransaction();

    const notificationEvents = groupChat.participants.map((pId) =>
      emitSocketEvent(req, pId.toString(), ChatEventEnum.GROUP_DELETED_EVENT, {
        chatId,
        deletedBy: req.user._id,
      })
    );

    await Promise.all(notificationEvents);

    await sendGroupNotifications(req, {
      chatId,
      participants: groupChat.participants,
      eventType: ChatEventEnum.GROUP_DELETED_EVENT,
      data: {
        chatId,
        deletedBy: req.user._id,
        groupName: groupChat.name,
      },
    });

    return res.status(200).json(new ApiResponse(200, {}, "Group chat deleted successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route POST /api/v1/chats/group/:chatId/join
 * @description Request to join a group
 */
const requestToJoinGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { message } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.findOne({
      _id: chatId,
      isGroupChat: true,
    })
      .select("participants pendingJoinRequests admins settings name")
      .lean()
      .session(session);

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found");
    }

    if (groupChat.settings.joinByLink) {
      throw new ApiError(400, "This group allows joining by link only");
    }

    if (groupChat.participants.some((p) => p.equals(req.user._id))) {
      throw new ApiError(400, "You are already a member of this group");
    }

    if (groupChat.pendingJoinRequests.some((req) => req.user.equals(req.user._id))) {
      throw new ApiError(400, "You have already requested to join this group");
    }

    const updatedChat = await GroupChat.findByIdAndUpdate(
      chatId,
      {
        $push: {
          pendingJoinRequests: {
            user: req.user._id,
            requestedAt: new Date(),
            message: message?.trim() || "",
          },
        },
        $set: { lastActivity: new Date() },
      },
      { new: true, lean: true, session }
    );

    const user = await User.findById(req.user._id).select("username").lean();

    await session.commitTransaction();

    const adminIds = Array.isArray(groupChat.admins) ? groupChat.admins : [];
    const adminNotifications = adminIds.map((adminId) =>
      emitSocketEvent(req, adminId.toString(), ChatEventEnum.JOIN_REQUEST_EVENT, {
        chatId,
        userId: req.user._id,
        username: user.username,
        message: message?.trim() || "",
      })
    );

    await Promise.all(adminNotifications);

    await sendGroupNotifications(req, {
      chatId,
      participants: adminIds,
      eventType: ChatEventEnum.JOIN_REQUEST_EVENT,
      data: {
        chatId,
        userId: req.user._id,
        username: user.username,
        message: message?.trim() || "",
        groupName: groupChat.name,
      },
    });

    return res.status(200).json(new ApiResponse(200, updatedChat, "Join request submitted successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route PUT /api/v1/chats/group/:chatId/approve/:userId
 * @description Approve or reject a join request
 */
const approveJoinRequest = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.params;
  const { approve } = req.body;

  if (typeof approve !== "boolean") {
    throw new ApiError(400, "Approve must be a boolean value");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.findOne({
      _id: chatId,
      isGroupChat: true,
      admins: req.user._id,
    })
      .select("participants pendingJoinRequests admins")
      .lean()
      .session(session);

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    const joinRequest = groupChat.pendingJoinRequests.find((req) => req.user.equals(userId));

    if (!joinRequest) {
      throw new ApiError(404, "Join request not found");
    }

    if (approve) {
      const userExists = await User.exists({ _id: userId }, { session });
      if (!userExists) {
        throw new ApiError(404, "User not found");
      }

      const unreadCount = await GroupChatMessage.countDocuments(
        {
          chat: chatId,
          sender: { $ne: userId },
        },
        { session }
      );

      const updatedChat = await GroupChat.findByIdAndUpdate(
        chatId,
        {
          $addToSet: { participants: userId },
          $pull: { pendingJoinRequests: { user: userId } },
          $push: { unreadCounts: { user: userId, count: unreadCount } },
          $set: { lastActivity: new Date() },
        },
        { new: true, lean: true, session }
      );

      await session.commitTransaction();

      await Promise.all([
        ...groupChat.participants.map((pId) =>
          emitSocketEvent(req, pId.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedChat)
        ),
        emitSocketEvent(req, userId.toString(), ChatEventEnum.NEW_GROUP_CHAT_EVENT, updatedChat),
        ...groupChat.admins.map((adminId) =>
          emitSocketEvent(req, adminId.toString(), ChatEventEnum.JOIN_REQUEST_APPROVED_EVENT, {
            chatId,
            userId,
            approvedBy: req.user._id,
          })
        ),
      ]);

      return res.status(200).json(new ApiResponse(200, updatedChat, "Join request approved successfully"));
    } else {
      const updatedChat = await GroupChat.findByIdAndUpdate(
        chatId,
        {
          $pull: { pendingJoinRequests: { user: userId } },
          $set: { lastActivity: new Date() },
        },
        { new: true, lean: true, session }
      );

      await session.commitTransaction();

      await emitSocketEvent(req, userId.toString(), ChatEventEnum.JOIN_REQUEST_REJECTED_EVENT, {
        chatId,
        rejectedBy: req.user._id,
      });

      return res.status(200).json(new ApiResponse(200, updatedChat, "Join request rejected successfully"));
    }
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route GET /api/v1/chats/group/:chatId/requests
 * @description Get pending join requests
 */
const getPendingJoinRequests = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  const groupChat = await GroupChat.findOne({
    _id: chatId,
    isGroupChat: true,
    admins: req.user._id,
  })
    .select("pendingJoinRequests")
    .populate({
      path: "pendingJoinRequests.user",
      select: "username email avatar",
    })
    .lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  const pendingRequests = groupChat.pendingJoinRequests.map((request) => ({
    userId: request.user._id,
    username: request.user.username,
    email: request.user.email,
    avatar: request.user.avatar,
    requestedAt: request.requestedAt,
    message: request.message || "",
  }));

  return res.status(200).json(new ApiResponse(200, pendingRequests, "Pending join requests fetched successfully"));
});

/**
 * @route POST /api/v1/chats/group/:chatId/generate-link
 * @description Generate or regenerate an invite link for a group
 */
const generateGroupInviteLink = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { expiresIn } = req.body;

  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized: User not logged in");
  }

  if (expiresIn && isNaN(expiresIn)) {
    throw new ApiError(400, "expiresIn must be a number (hours)");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.findOne({
      _id: chatId,
      isGroupChat: true,
      admins: req.user._id,
    }).session(session);

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    if (!groupChat.settings) {
      groupChat.settings = {};
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 60 * 60 * 1000) : null;

    groupChat.settings.joinByLink = true;
    groupChat.settings.inviteLinkToken = token;
    if (expiresAt) groupChat.settings.inviteLinkExpiresAt = expiresAt;

    await groupChat.save({ session });

    await session.commitTransaction();

    const joinLink = `${req.protocol}://${req.get("host")}/api/v1/join/${token}`;

    return res.status(200).json(
      new ApiResponse(200, { joinLink, expiresAt }, "Group invite link generated successfully")
    );
  } catch (error) {
    await session.abortTransaction();
    console.error("Error in generateGroupInviteLink:", error);
    throw error instanceof ApiError ? error : new ApiError(500, error.message || "Failed to generate invite link");
  } finally {
    session.endSession();
  }
});

/**
 * @route POST /api/v1/chats/group/join/:token
 * @description Join a group using an invite link
 */
const joinGroupViaLink = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.findOne({
      "settings.inviteLinkToken": token,
      isGroupChat: true,
    }).session(session);

    if (!groupChat) {
      throw new ApiError(404, "Invalid or expired invite link");
    }

    if (groupChat.settings.inviteLinkExpiresAt && new Date() > groupChat.settings.inviteLinkExpiresAt) {
      throw new ApiError(400, "This invite link has expired");
    }

    if (groupChat.participants.some((p) => p.equals(req.user._id))) {
      throw new ApiError(400, "You are already a member of this group");
    }

    const unreadCount = await GroupChatMessage.countDocuments(
      {
        chat: groupChat._id,
        sender: { $ne: req.user._id },
      },
      { session }
    );

    groupChat.participants.push(req.user._id);
    groupChat.unreadCounts.push({ user: req.user._id, count: unreadCount });
    await groupChat.save({ session });

    const [updatedGroupChat] = await GroupChat.aggregate([
      { $match: { _id: groupChat._id } },
      ...chatCommonAggregation(req.user._id),
    ]);

    await session.commitTransaction();

    const notificationEvents = updatedGroupChat.participants
      .filter((p) => !p._id.equals(req.user._id))
      .map((participant) =>
        emitSocketEvent(req, participant._id.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedGroupChat)
      );

    await Promise.all(notificationEvents);

    return res.status(200).json(new ApiResponse(200, updatedGroupChat, "Successfully joined the group"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @route DELETE /api/v1/chats/group/:chatId/revoke-link
 * @description Revoke the current invite link
 */
const revokeGroupInviteLink = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const groupChat = await GroupChat.findOneAndUpdate(
      {
        _id: chatId,
        isGroupChat: true,
        admins: req.user._id,
      },
      {
        $set: {
          "settings.joinByLink": false,
          "settings.inviteLinkToken": null,
          "settings.inviteLinkExpiresAt": null,
        },
      },
      { new: true, session }
    );

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    await session.commitTransaction();

    return res.status(200).json(new ApiResponse(200, {}, "Group invite link revoked successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// Utility function for sending notifications
const sendGroupNotifications = async (req, { chatId, participants, excludedUsers = [], eventType, data, includePushNotifications = true }) => {
  try {
    const usersToNotify = await User.find({
      _id: { $in: participants },
      _id: { $nin: excludedUsers },
    }).select("_id deviceToken");

    const socketNotifications = usersToNotify.map((user) => {
      try {
        return emitSocketEvent(req, user._id.toString(), eventType, data);
      } catch (error) {
        console.error(`Socket notification failed for user ${user._id}`, error);
        return null;
      }
    });

    let pushNotifications = [];
    if (includePushNotifications && admin?.messaging) {
      pushNotifications = usersToNotify
        .filter((user) => user.deviceToken)
        .map(async (user) => {
          try {
            const message = {
              notification: {
                title: "Group Update",
                body: getNotificationBody(eventType, data),
              },
              token: user.deviceToken,
              data: {
                chatId: chatId.toString(),
                type: eventType,
                ...data,
              },
            };
            await admin.messaging().send(message);
          } catch (error) {
            console.error(`FCM failed for user ${user._id}`, error);
          }
        });
    }

    await Promise.allSettled([...socketNotifications, ...pushNotifications]);
  } catch (error) {
    console.error("Error in sendGroupNotifications:", error);
  }
};

// Helper function for notification content
const getNotificationBody = (eventType, data) => {
  switch (eventType) {
    case ChatEventEnum.UPDATE_GROUP_EVENT:
      return "Group details were updated";
    case ChatEventEnum.NEW_GROUP_CHAT_EVENT:
      return `You were added to group "${data.name}"`;
    case ChatEventEnum.REMOVED_FROM_GROUP_EVENT:
      return "You were removed from a group";
    case ChatEventEnum.LEFT_GROUP_EVENT:
      return "You left the group";
    case ChatEventEnum.GROUP_DELETED_EVENT:
      return "A group was deleted";
    case ChatEventEnum.JOIN_REQUEST_EVENT:
      return `New join request from ${data.username}`;
    default:
      return "Group notification";
  }
};

export {
  getAllGroups,
  getAllGroupChats,
  sendGroupMessage,
  getAllGroupMessages,
  getGroupChatDetails,
  createGroupChat,
  updateGroupChatDetails,
  addParticipantsToGroup,
  removeParticipantFromGroup,
  leaveGroupChat,
  deleteGroupChat,
  requestToJoinGroup,
  approveJoinRequest,
  getPendingJoinRequests,
  generateGroupInviteLink,
  joinGroupViaLink,
  revokeGroupInviteLink,
  checkGroupMessagePermissions,
};