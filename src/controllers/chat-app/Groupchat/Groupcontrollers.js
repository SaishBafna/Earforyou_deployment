import mongoose from "mongoose";
import { ChatEventEnum } from "../../../constants.js";
import User from "../../../models/Users.js";
import { Chat } from "../../../models/group/chat.models.js";
import { ChatMessage } from "../../../models/group/message.models.js";
import { emitSocketEvent } from "../../../socket/index.js";
import { ApiError } from "../../../utils/ApiError.js";
import { ApiResponse } from "../../../utils/ApiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { getLocalPath, getStaticFilePath, removeLocalFile } from "../../../utils/helpers.js";

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
      from: "chatmessages",
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
      unreadCount: {
        $ifNull: [
          {
            $let: {
              vars: {
                userUnread: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$unreadCounts",
                        cond: { $eq: ["$$this.user", userId] },
                      },
                    },
                    0,
                  ],
                },
              },
              in: "$userUnread.count",
            },
          },
          0,
        ],
      },
      sortField: { $ifNull: ["$lastMessage.createdAt", "$createdAt"] },
    },
  },
  { $sort: { sortField: -1 } },
];

// Helper function to delete all messages and attachments for a chat
const deleteCascadeChatMessages = async (chatId) => {
  const messages = await ChatMessage.find({ chat: chatId })
    .select("attachments")
    .lean();

  const fileDeletions = messages.flatMap((message) =>
    message.attachments
      .filter((attachment) => attachment.localPath)
      .map((attachment) => removeLocalFile(attachment.localPath))
  );

  await Promise.all([
    ...fileDeletions,
    ChatMessage.deleteMany({ chat: chatId }),
  ]);
};

// Helper function to get paginated messages
const getPaginatedMessages = async (chatId, userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  
  const [messages, totalCount] = await Promise.all([
    ChatMessage.aggregate([
      {
        $match: {
          chat: new mongoose.Types.ObjectId(chatId),
          deletedFor: { $ne: userId }
        }
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
          pipeline: [{ $project: { username: 1, avatar: 1, email: 1 } }]
        }
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
          reactions: 1
        }
      }
    ]),
    ChatMessage.countDocuments({
      chat: chatId,
      deletedFor: { $ne: userId }
    })
  ]);

  return {
    messages,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    page,
    limit
  };
};

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

  // Verify user is a participant
  const isParticipant = await Chat.exists({
    _id: chatId,
    isGroupChat: true,
    participants: req.user._id
  });

  if (!isParticipant) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  // Get paginated messages
  const { messages, totalCount, totalPages } = await getPaginatedMessages(
    chatId,
    req.user._id,
    page,
    limit
  );

  // Mark messages as read in bulk
  await Promise.all([
    ChatMessage.updateMany(
      {
        chat: chatId,
        seenBy: { $ne: req.user._id },
        sender: { $ne: req.user._id }
      },
      { $addToSet: { seenBy: req.user._id }, $set: { isRead: true } }
    ),
    Chat.updateOne(
      { _id: chatId, "unreadCounts.user": req.user._id },
      { $set: { "unreadCounts.$.count": 0 } }
    )
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { messages, page, limit, totalCount, totalPages },
      "Group messages fetched successfully"
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

  // Get group chat in single query
  const groupChat = await Chat.findOneAndUpdate(
    {
      _id: chatId,
      isGroupChat: true,
      participants: req.user._id
    },
    { $set: { lastActivity: new Date() } },
    { new: true, lean: true }
  );

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  // Validate replyTo message if provided
  let replyToMessage = null;
  if (replyTo) {
    replyToMessage = await ChatMessage.findOne({
      _id: replyTo,
      chat: chatId
    }).lean();
    if (!replyToMessage) {
      throw new ApiError(400, "Replied message not found in this chat");
    }
  }

  // Process attachments
  const messageFiles = (req.files?.attachments || []).map((attachment) => ({
    url: getStaticFilePath(req, attachment.filename),
    localPath: getLocalPath(attachment.filename),
    fileType: attachment.mimetype.split("/")[0] || "other",
    fileName: attachment.originalname,
    size: attachment.size
  }));

  // Create the message
  const message = await ChatMessage.create({
    sender: req.user._id,
    content: content || "",
    chat: chatId,
    attachments: messageFiles,
    replyTo: replyToMessage?._id
  });

  // Prepare update operations for unread counts
  const participantsToUpdate = groupChat.participants
    .filter(p => !p.equals(req.user._id))
    .map(p => p.toString());

  const updateOps = {
    $set: { lastMessage: message._id },
    $inc: { ...participantsToUpdate.reduce((acc, p) => {
      acc[`unreadCounts.${p}.count`] = 1;
      return acc;
    }, {})}
  };

  await Chat.findByIdAndUpdate(chatId, updateOps);

  // Get populated message in single aggregation
  const [populatedMessage] = await ChatMessage.aggregate([
    { $match: { _id: message._id } },
    {
      $lookup: {
        from: "users",
        localField: "sender",
        foreignField: "_id",
        as: "sender",
        pipeline: [{ $project: { username: 1, avatar: 1, email: 1 } }]
      }
    },
    { $unwind: "$sender" },
    {
      $lookup: {
        from: "chatmessages",
        localField: "replyTo",
        foreignField: "_id",
        as: "replyTo",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "sender",
              foreignField: "_id",
              as: "sender",
              pipeline: [{ $project: { username: 1, avatar: 1 } }]
            }
          },
          { $unwind: "$sender" },
          { $project: { content: 1, sender: 1, attachments: 1 } }
        ]
      }
    },
    { $unwind: { path: "$replyTo", preserveNullAndEmptyArrays: true } }
  ]);

  if (!populatedMessage) {
    throw new ApiError(500, "Failed to send message");
  }

  // Get sender info for notifications
  const sender = await User.findById(req.user._id)
    .select("username name avatar")
    .lean();

  const senderName = sender.name || sender.username;
  const notificationMessage = content 
    ? `${senderName}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`
    : `${senderName} sent an attachment`;

  // Emit socket events to participants
  const socketEvents = groupChat.participants
    .filter(p => !p.equals(req.user._id))
    .map(participantId => 
      emitSocketEvent(
        req,
        participantId.toString(),
        ChatEventEnum.MESSAGE_RECEIVED_EVENT,
        populatedMessage
      )
    );

  await Promise.all(socketEvents);

  return res
    .status(201)
    .json(new ApiResponse(201, populatedMessage, "Message sent successfully"));
});

/**
 * @route GET /api/v1/chats/group
 * @description Get all group chats for the current user with unread counts
 */
const getAllGroupChats = asyncHandler(async (req, res) => {
  const { search } = req.query;

  const matchStage = {
    isGroupChat: true,
    participants: req.user._id,
    ...(search && { name: { $regex: search.trim(), $options: "i" } }),
  };

  const groupChats = await Chat.aggregate([
    { $match: matchStage },
    ...chatCommonAggregation(req.user._id),
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
        lastActivity: 1
      },
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, groupChats, "Group chats fetched successfully"));
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

  // Get group chat with common aggregation
  const [groupChat] = await Chat.aggregate([
    { 
      $match: { 
        _id: new mongoose.Types.ObjectId(chatId),
        isGroupChat: true,
        participants: req.user._id
      } 
    },
    ...chatCommonAggregation(req.user._id),
  ]);

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  // Get paginated messages
  const { messages, totalCount, totalPages } = await getPaginatedMessages(
    chatId,
    req.user._id,
    page,
    limit
  );

  // Mark messages as read in bulk
  await Promise.all([
    ChatMessage.updateMany(
      {
        chat: chatId,
        seenBy: { $ne: req.user._id },
        sender: { $ne: req.user._id }
      },
      { $addToSet: { seenBy: req.user._id }, $set: { isRead: true } }
    ),
    Chat.updateOne(
      { _id: chatId, "unreadCounts.user": req.user._id },
      { $set: { "unreadCounts.$.count": 0 } }
    )
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...groupChat, messages, page, limit, totalCount, totalPages },
      "Group chat details fetched successfully"
    )
  );
});

/**
 * @route POST /api/v1/chats/group
 * @description Create a new group chat
 */
const createGroupChat = asyncHandler(async (req, res) => {
  const { name, participants } = req.body;

  if (!name?.trim() || !Array.isArray(participants) || participants.length < 2) {
    throw new ApiError(400, "Name and at least two participants are required");
  }

  // Validate participants
  const participantIds = [...new Set([
    req.user._id, 
    ...participants.map(id => new mongoose.Types.ObjectId(id))
  ])];

  const usersCount = await User.countDocuments({ _id: { $in: participantIds } });
  if (usersCount !== participantIds.length) {
    throw new ApiError(404, "One or more users not found");
  }

  // Create group chat with initial unread counts
  const groupChat = await Chat.create({
    name: name.trim(),
    isGroupChat: true,
    participants: participantIds,
    admins: [req.user._id],
    createdBy: req.user._id,
    unreadCounts: participantIds
      .filter(id => !id.equals(req.user._id))
      .map(user => ({ user, count: 1 })),
    lastActivity: new Date()
  });

  // Get populated group chat
  const [createdGroupChat] = await Chat.aggregate([
    { $match: { _id: groupChat._id } },
    ...chatCommonAggregation(req.user._id),
  ]);

  if (!createdGroupChat) {
    throw new ApiError(500, "Failed to create group chat");
  }

  // Notify participants
  const notificationEvents = createdGroupChat.participants
    .filter(p => !p._id.equals(req.user._id))
    .map(participant =>
      emitSocketEvent(
        req,
        participant._id.toString(),
        ChatEventEnum.NEW_GROUP_CHAT_EVENT,
        createdGroupChat
      )
    );

  await Promise.all(notificationEvents);

  return res
    .status(201)
    .json(new ApiResponse(201, createdGroupChat, "Group chat created successfully"));
});

/**
 * @route PUT /api/v1/chats/group/:chatId
 * @description Update group chat details (name, avatar)
 */
const updateGroupChatDetails = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { name, avatar } = req.body;

  if (!name?.trim() && !avatar) {
    throw new ApiError(400, "At least one field to update is required");
  }

  const updateFields = {};
  if (name?.trim()) updateFields.name = name.trim();
  if (avatar) updateFields.avatar = avatar;
  updateFields.lastActivity = new Date();

  const updatedGroupChat = await Chat.findOneAndUpdate(
    { _id: chatId, isGroupChat: true, admins: req.user._id },
    { $set: updateFields },
    { new: true, lean: true }
  );

  if (!updatedGroupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  // Notify all participants
  const notificationEvents = updatedGroupChat.participants.map(pId =>
    emitSocketEvent(
      req,
      pId.toString(),
      ChatEventEnum.UPDATE_GROUP_EVENT,
      updatedGroupChat
    )
  );

  await Promise.all(notificationEvents);

  return res
    .status(200)
    .json(new ApiResponse(200, updatedGroupChat, "Group updated successfully"));
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

  // Get group chat and validate admin status
  const groupChat = await Chat.findOne({
    _id: chatId,
    isGroupChat: true,
    admins: req.user._id
  }).lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  // Filter out existing participants
  const newParticipants = participants
    .map(id => new mongoose.Types.ObjectId(id))
    .filter(p => !groupChat.participants.some(existing => existing.equals(p)));

  if (newParticipants.length === 0) {
    throw new ApiError(400, "All users are already in the group");
  }

  // Validate users exist
  const usersCount = await User.countDocuments({ _id: { $in: newParticipants } });
  if (usersCount !== newParticipants.length) {
    throw new ApiError(404, "One or more users not found");
  }

  // Calculate unread counts for new participants
  const unreadCounts = await ChatMessage.aggregate([
    {
      $match: {
        chat: new mongoose.Types.ObjectId(chatId),
        sender: { $nin: newParticipants }
      }
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 }
      }
    }
  ]);

  const totalUnread = unreadCounts[0]?.count || 0;

  // Prepare updates
  const updates = {
    $addToSet: { participants: { $each: newParticipants } },
    $push: {
      unreadCounts: {
        $each: newParticipants.map(user => ({ user, count: totalUnread }))
      }
    },
    $set: { lastActivity: new Date() }
  };

  const updatedGroupChat = await Chat.findByIdAndUpdate(
    chatId,
    updates,
    { new: true, lean: true }
  );

  // Notify existing participants and new members
  const notificationEvents = [
    ...groupChat.participants.map(pId =>
      emitSocketEvent(
        req,
        pId.toString(),
        ChatEventEnum.UPDATE_GROUP_EVENT,
        updatedGroupChat
      )
    ),
    ...newParticipants.map(pId =>
      emitSocketEvent(
        req,
        pId.toString(),
        ChatEventEnum.NEW_GROUP_CHAT_EVENT,
        updatedGroupChat
      )
    )
  ];

  await Promise.all(notificationEvents);

  return res
    .status(200)
    .json(new ApiResponse(200, updatedGroupChat, "Participants added successfully"));
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

  // Validate participant ID format
  let participantObjectId;
  try {
    participantObjectId = new mongoose.Types.ObjectId(participantId);
  } catch (err) {
    throw new ApiError(400, "Invalid participant ID format");
  }

  // Get group chat and validate admin status
  const groupChat = await Chat.findOne({
    _id: chatId,
    isGroupChat: true,
    admins: req.user._id
  }).lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  // Check if participant is in the group
  if (!groupChat.participants.some(p => p.equals(participantObjectId))) {
    throw new ApiError(400, "User is not in this group");
  }

  if (participantObjectId.equals(req.user._id)) {
    throw new ApiError(400, "Use leave group endpoint instead");
  }

  // Remove participant
  const updatedGroupChat = await Chat.findByIdAndUpdate(
    chatId,
    {
      $pull: {
        participants: participantObjectId,
        admins: participantObjectId,
        unreadCounts: { user: participantObjectId }
      },
      $set: { lastActivity: new Date() }
    },
    { new: true, lean: true }
  );

  // Notify participants and removed user
  await Promise.all([
    ...updatedGroupChat.participants.map(pId =>
      emitSocketEvent(
        req,
        pId.toString(),
        ChatEventEnum.UPDATE_GROUP_EVENT,
        updatedGroupChat
      )
    ),
    emitSocketEvent(
      req,
      participantId,
      ChatEventEnum.REMOVED_FROM_GROUP_EVENT,
      {
        chatId,
        removedBy: req.user._id,
      }
    )
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, updatedGroupChat, "Participant removed successfully"));
});

/**
 * @route PUT /api/v1/chats/group/:chatId/leave
 * @description Leave a group chat
 */
const leaveGroupChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  // Get group chat and validate participation
  const groupChat = await Chat.findOne({
    _id: chatId,
    isGroupChat: true,
    participants: req.user._id
  }).lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  const otherParticipants = groupChat.participants.filter(
    p => !p.equals(req.user._id)
  );

  // Handle last participant leaving
  if (otherParticipants.length === 0) {
    await Promise.all([
      Chat.findByIdAndDelete(chatId),
      deleteCascadeChatMessages(chatId)
    ]);

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Group deleted as last participant left"));
  }

  // Check if leaving user is the last admin
  const isLastAdmin = groupChat.admins.length === 1 && 
                     groupChat.admins[0].equals(req.user._id);

  // Prepare update operations
  const update = {
    $pull: {
      participants: req.user._id,
      admins: req.user._id,
      unreadCounts: { user: req.user._id }
    },
    $set: { lastActivity: new Date() }
  };

  // If last admin, promote another participant
  if (isLastAdmin && otherParticipants.length > 0) {
    update.$addToSet = { admins: otherParticipants[0] };
  }

  const updatedGroupChat = await Chat.findByIdAndUpdate(
    chatId,
    update,
    { new: true, lean: true }
  );

  // Notify participants and leaving user
  await Promise.all([
    ...updatedGroupChat.participants.map(pId =>
      emitSocketEvent(
        req,
        pId.toString(),
        ChatEventEnum.UPDATE_GROUP_EVENT,
        updatedGroupChat
      )
    ),
    emitSocketEvent(
      req,
      req.user._id.toString(),
      ChatEventEnum.LEFT_GROUP_EVENT,
      { chatId }
    )
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Left group successfully"));
});

/**
 * @route DELETE /api/v1/chats/group/:chatId
 * @description Delete a group chat (admin only)
 */
const deleteGroupChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  // Verify admin status and get participants
  const groupChat = await Chat.findOneAndDelete({
    _id: chatId,
    isGroupChat: true,
    admins: req.user._id
  }).lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  // Delete all messages and attachments
  await deleteCascadeChatMessages(chatId);

  // Notify all participants
  const notificationEvents = groupChat.participants.map(pId =>
    emitSocketEvent(
      req,
      pId.toString(),
      ChatEventEnum.GROUP_DELETED_EVENT,
      {
        chatId,
        deletedBy: req.user._id,
      }
    )
  );

  await Promise.all(notificationEvents);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Group chat deleted successfully"));
});

/**
 * @route POST /api/v1/chats/group/:chatId/join
 * @description Request to join a group
 */
const requestToJoinGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  // Get group chat and validate
  const groupChat = await Chat.findOne({ 
    _id: chatId, 
    isGroupChat: true 
  }).select("participants pendingJoinRequests admins").lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found");
  }

  // Check if already a member
  if (groupChat.participants.some(p => p.equals(req.user._id))) {
    throw new ApiError(400, "You are already a member of this group");
  }

  // Check if already requested
  if (groupChat.pendingJoinRequests.some(req => req.user.equals(req.user._id))) {
    throw new ApiError(400, "You have already requested to join this group");
  }

  // Add join request
  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    {
      $push: {
        pendingJoinRequests: {
          user: req.user._id,
          requestedAt: new Date(),
        },
      },
      $set: { lastActivity: new Date() }
    },
    { new: true, lean: true }
  );

  // Get user info for notification
  const user = await User.findById(req.user._id)
    .select("username")
    .lean();

  // Notify group admins
  const adminNotifications = groupChat.admins.map(adminId =>
    emitSocketEvent(
      req,
      adminId.toString(),
      ChatEventEnum.JOIN_REQUEST_EVENT,
      {
        chatId,
        userId: req.user._id,
        username: user.username,
      }
    )
  );

  await Promise.all(adminNotifications);

  return res
    .status(200)
    .json(new ApiResponse(200, updatedChat, "Join request submitted successfully"));
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

  // Get group chat and validate admin status
  const groupChat = await Chat.findOne({
    _id: chatId,
    isGroupChat: true,
    admins: req.user._id,
  }).select("participants pendingJoinRequests admins").lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  // Find the join request
  const joinRequest = groupChat.pendingJoinRequests.find(req =>
    req.user.equals(userId)
  );
  
  if (!joinRequest) {
    throw new ApiError(404, "Join request not found");
  }

  if (approve) {
    // Validate user exists
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      throw new ApiError(404, "User not found");
    }

    // Calculate unread count for the new participant
    const unreadCount = await ChatMessage.countDocuments({
      chat: chatId,
      sender: { $ne: userId },
    });

    // Add user to participants
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        $addToSet: { participants: userId },
        $pull: { pendingJoinRequests: { user: userId } },
        $push: { unreadCounts: { user: userId, count: unreadCount } },
        $set: { lastActivity: new Date() }
      },
      { new: true, lean: true }
    );

    // Notify all parties
    await Promise.all([
      ...groupChat.participants.map(pId =>
        emitSocketEvent(
          req,
          pId.toString(),
          ChatEventEnum.UPDATE_GROUP_EVENT,
          updatedChat
        )
      ),
      emitSocketEvent(
        req,
        userId.toString(),
        ChatEventEnum.NEW_GROUP_CHAT_EVENT,
        updatedChat
      ),
      ...groupChat.admins.map(adminId =>
        emitSocketEvent(
          req,
          adminId.toString(),
          ChatEventEnum.JOIN_REQUEST_APPROVED_EVENT,
          {
            chatId,
            userId,
            approvedBy: req.user._id,
          }
        )
      ),
    ]);

    return res
      .status(200)
      .json(new ApiResponse(200, updatedChat, "Join request approved successfully"));
  } else {
    // Reject the join request
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        $pull: { pendingJoinRequests: { user: userId } },
        $set: { lastActivity: new Date() }
      },
      { new: true, lean: true }
    );

    // Notify the rejected user
    await emitSocketEvent(
      req,
      userId.toString(),
      ChatEventEnum.JOIN_REQUEST_REJECTED_EVENT,
      {
        chatId,
        rejectedBy: req.user._id,
      }
    );

    return res
      .status(200)
      .json(new ApiResponse(200, updatedChat, "Join request rejected successfully"));
  }
});

/**
 * @route GET /api/v1/chats/group/:chatId/requests
 * @description Get pending join requests
 */
const getPendingJoinRequests = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  // Get group chat and validate admin status
  const groupChat = await Chat.findOne({
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

  // Format response
  const pendingRequests = groupChat.pendingJoinRequests.map((request) => ({
    userId: request.user._id,
    username: request.user.username,
    email: request.user.email,
    avatar: request.user.avatar,
    requestedAt: request.requestedAt,
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, pendingRequests, "Pending join requests fetched successfully"));
});

export {
  getAllGroupChats,
  createGroupChat,
  getGroupChatDetails,
  updateGroupChatDetails,
  addParticipantsToGroup,
  removeParticipantFromGroup,
  leaveGroupChat,
  deleteGroupChat,
  approveJoinRequest,
  requestToJoinGroup,
  getPendingJoinRequests,
  getAllGroupMessages,
  sendGroupMessage
};