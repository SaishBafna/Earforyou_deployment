import mongoose from "mongoose";
import { ChatEventEnum } from "../../../constants.js";
import User from "../../../models/Users.js";
import { Chat } from "../../../models/group/chat.models.js";
import { ChatMessage } from "../../../models/group/message.models.js";
import { emitSocketEvent } from "../../../socket/index.js";
import { ApiError } from "../../../utils/ApiError.js";
import { ApiResponse } from "../../../utils/ApiResponse.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { removeLocalFile } from "../../../utils/helpers.js";

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

const deleteCascadeChatMessages = async (chatId) => {
  const messages = await ChatMessage.find({ chat: new mongoose.Types.ObjectId(chatId) })
    .select("attachments")
    .lean();

  await Promise.all(
    messages.flatMap((message) =>
      message.attachments.map((attachment) =>
        attachment.localPath ? removeLocalFile(attachment.localPath) : null
      )
    )
  );

  await ChatMessage.deleteMany({ chat: new mongoose.Types.ObjectId(chatId) });
};



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
      },
    },
  ]).exec();

  return res
    .status(200)
    .json(new ApiResponse(200, groupChats, "Group chats fetched successfully"));
});

/**
 * @route GET /api/v1/chats/group/:userId
 * @description Get all group chats for a specific user (admin access required)
 */
const getGroupChatsForUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { search } = req.query;



  const targetUser = await User.findById(userId).select("_id").lean();
  if (!targetUser) {
    throw new ApiError(404, "User not found");
  }

  const matchStage = {
    isGroupChat: true,
    participants: new mongoose.Types.ObjectId(userId),
    ...(search && { name: { $regex: search.trim(), $options: "i" } }),
  };

  const groupChats = await Chat.aggregate([
    { $match: matchStage },
    ...chatCommonAggregation(new mongoose.Types.ObjectId(userId)),
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
      },
    },
  ]).exec();

  return res
    .status(200)
    .json(new ApiResponse(200, groupChats, `Group chats for user ${userId} fetched successfully`));
});

/**
 * @route POST /api/v1/messages/:messageId/read
 * @description Mark a message as read and update seen status
 */
const markMessageAsRead = asyncHandler(async (req, res) => {
  const { messageId } = req.params;

  const message = await ChatMessage.findById(messageId)
    .select("chat seenBy isRead sender")
    .lean();

  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  const chat = await Chat.findById(message.chat)
    .select("participants")
    .lean();

  if (!chat.participants.some((p) => p.equals(req.user._id))) {
    throw new ApiError(403, "You are not a participant in this chat");
  }

  if (message.seenBy.some((user) => user.equals(req.user._id))) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { messageId, seenBy: message.seenBy, isRead: message.isRead },
          "Message already marked as read"
        )
      );
  }

  const [updatedMessage] = await Promise.all([
    ChatMessage.findByIdAndUpdate(
      messageId,
      { $addToSet: { seenBy: req.user._id }, $set: { isRead: true } },
      { new: true, select: "seenBy isRead" }
    ),
    Chat.updateOne(
      { _id: message.chat, "unreadCounts.user": req.user._id },
      { $inc: { "unreadCounts.$.count": -1 } }
    ),
  ]);

  emitSocketEvent(req, message.chat.toString(), ChatEventEnum.MESSAGE_READ_EVENT, {
    messageId,
    seenBy: updatedMessage.seenBy,
    chatId: message.chat,
    readBy: req.user._id,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { messageId, seenBy: updatedMessage.seenBy, isRead: updatedMessage.isRead },
        "Message marked as read successfully"
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

  const participantIds = [...new Set([req.user._id, ...participants.map((id) => new mongoose.Types.ObjectId(id))])];
  const users = await User.find({ _id: { $in: participantIds } }).select("_id").lean();
  if (users.length !== participantIds.length) {
    throw new ApiError(404, "One or more users not found");
  }

  const unreadCounts = participantIds
    .filter((id) => !id.equals(req.user._id))
    .map((user) => ({ user, count: 1 }));

  const groupChat = await Chat.create({
    name: name.trim(),
    isGroupChat: true,
    participants: participantIds,
    admins: [req.user._id],
    createdBy: req.user._id,
    unreadCounts,
  });

  const [createdGroupChat] = await Chat.aggregate([
    { $match: { _id: groupChat._id } },
    ...chatCommonAggregation(req.user._id),
  ]);

  if (!createdGroupChat) {
    throw new ApiError(500, "Failed to create group chat");
  }

  await Promise.all(
    createdGroupChat.participants.map((participant) =>
      !participant._id.equals(req.user._id)
        ? emitSocketEvent(req, participant._id.toString(), ChatEventEnum.NEW_GROUP_CHAT_EVENT, createdGroupChat)
        : null
    )
  );

  return res
    .status(201)
    .json(new ApiResponse(201, createdGroupChat, "Group chat created successfully"));
});

/**
 * @route GET /api/v1/chats/group/:chatId
 * @description Get group chat details with paginated messages
 */
const getGroupChatDetails = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  if (pageNum < 1 || limitNum < 1) {
    throw new ApiError(400, "Invalid page or limit");
  }

  const [groupChat] = await Chat.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(chatId), isGroupChat: true } },
    ...chatCommonAggregation(req.user._id),
  ]);

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found");
  }

  if (!groupChat.participants.some((p) => p._id.equals(req.user._id))) {
    throw new ApiError(403, "You are not a member of this group");
  }

  const [messages] = await Promise.all([
    ChatMessage.aggregate([
      {
        $match: {
          chat: new mongoose.Types.ObjectId(chatId),
          deletedFor: { $ne: req.user._id },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (pageNum - 1) * limitNum },
      { $limit: limitNum },
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
    ChatMessage.updateMany(
      {
        chat: chatId,
        seenBy: { $ne: req.user._id },
        sender: { $ne: req.user._id },
      },
      { $addToSet: { seenBy: req.user._id }, $set: { isRead: true } }
    ),
    Chat.updateOne(
      { _id: chatId, "unreadCounts.user": req.user._id },
      { $set: { "unreadCounts.$.count": 0 } }
    ),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { ...groupChat, messages, page: pageNum, limit: limitNum },
        "Group chat details fetched successfully"
      )
    );
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

  const updatedGroupChat = await Chat.findOneAndUpdate(
    { _id: chatId, isGroupChat: true, admins: req.user._id },
    { $set: updateFields },
    { new: true, lean: true }
  );

  if (!updatedGroupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  await Promise.all(
    updatedGroupChat.participants.map((pId) =>
      emitSocketEvent(req, pId.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedGroupChat)
    )
  );

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

  if (!Array.isArray(participants) || !participants.length) {
    throw new ApiError(400, "Participants array is required");
  }

  const groupChat = await Chat.findOne({ _id: chatId, isGroupChat: true, admins: req.user._id })
    .select("participants")
    .lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  const newParticipants = participants.filter(
    (p) => !groupChat.participants.some((existing) => existing.equals(p))
  );

  if (!newParticipants.length) {
    throw new ApiError(400, "All users are already in the group");
  }

  const users = await User.find({ _id: { $in: newParticipants } }).select("_id").lean();
  if (users.length !== newParticipants.length) {
    throw new ApiError(404, "One or more users not found");
  }

  const unreadUpdates = await Promise.all(
    newParticipants.map(async (user) => ({
      user,
      count: await ChatMessage.countDocuments({ chat: chatId, sender: { $ne: user } }),
    }))
  );

  const updatedGroupChat = await Chat.findByIdAndUpdate(
    chatId,
    {
      $addToSet: { participants: { $each: newParticipants } },
      $push: { unreadCounts: { $each: unreadUpdates } },
    },
    { new: true, lean: true }
  );

  await Promise.all([
    ...groupChat.participants.map((pId) =>
      emitSocketEvent(req, pId.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedGroupChat)
    ),
    ...newParticipants.map((pId) =>
      emitSocketEvent(req, pId.toString(), ChatEventEnum.NEW_GROUP_CHAT_EVENT, updatedGroupChat)
    ),
  ]);

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

  const groupChat = await Chat.findOne({ _id: chatId, isGroupChat: true, admins: req.user._id })
    .select("participants")
    .lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  if (!groupChat.participants.some((p) => p.equals(participantId))) {
    throw new ApiError(400, "User is not in this group");
  }

  if (participantId === req.user._id.toString()) {
    throw new ApiError(400, "Use leave group endpoint instead");
  }

  const updatedGroupChat = await Chat.findByIdAndUpdate(
    chatId,
    {
      $pull: {
        participants: participantId,
        admins: participantId,
        unreadCounts: { user: participantId },
      },
    },
    { new: true, lean: true }
  );

  await Promise.all([
    ...updatedGroupChat.participants.map((pId) =>
      emitSocketEvent(req, pId.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedGroupChat)
    ),
    emitSocketEvent(req, participantId, ChatEventEnum.REMOVED_FROM_GROUP_EVENT, {
      chatId,
      removedBy: req.user._id,
    }),
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

  const groupChat = await Chat.findOne({ _id: chatId, isGroupChat: true, participants: req.user._id })
    .select("participants admins")
    .lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  const isLastAdmin = groupChat.admins.length === 1 && groupChat.admins[0].equals(req.user._id);
  const otherParticipants = groupChat.participants.filter((p) => !p.equals(req.user._id));

  if (!otherParticipants.length) {
    await Promise.all([
      Chat.findByIdAndDelete(chatId),
      deleteCascadeChatMessages(chatId),
    ]);

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Group deleted as last participant left"));
  }

  const update = {
    $pull: {
      participants: req.user._id,
      admins: req.user._id,
      unreadCounts: { user: req.user._id },
    },
    ...(isLastAdmin && { $addToSet: { admins: otherParticipants[0] } }),
  };

  const updatedGroupChat = await Chat.findByIdAndUpdate(chatId, update, { new: true, lean: true });

  await Promise.all([
    ...updatedGroupChat.participants.map((pId) =>
      emitSocketEvent(req, pId.toString(), ChatEventEnum.UPDATE_GROUP_EVENT, updatedGroupChat)
    ),
    emitSocketEvent(req, req.user._id.toString(), ChatEventEnum.LEFT_GROUP_EVENT, { chatId }),
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

  const groupChat = await Chat.findOne({ _id: chatId, isGroupChat: true, admins: req.user._id })
    .select("participants")
    .lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  await Promise.all([
    Chat.findByIdAndDelete(chatId),
    deleteCascadeChatMessages(chatId),
  ]);

  await Promise.all(
    groupChat.participants.map((pId) =>
      emitSocketEvent(req, pId.toString(), ChatEventEnum.GROUP_DELETED_EVENT, {
        chatId,
        deletedBy: req.user._id,
      })
    )
  );

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Group chat deleted successfully"));
});

const requestToJoinGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  const groupChat = await Chat.findOne({ _id: chatId, isGroupChat: true })
    .select("participants pendingJoinRequests admins")
    .lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found");
  }

  if (groupChat.participants.some((p) => p.equals(req.user._id))) {
    throw new ApiError(400, "You are already a member of this group");
  }

  if (groupChat.pendingJoinRequests.some((req) => req.user.equals(req.user._id))) {
    throw new ApiError(400, "You have already requested to join this group");
  }

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    {
      $push: {
        pendingJoinRequests: {
          user: req.user._id,
          requestedAt: new Date(),
        },
      },
    },
    { new: true, lean: true }
  );

  // Notify group admins
  await Promise.all(
    groupChat.admins.map((adminId) =>
      emitSocketEvent(req, adminId.toString(), ChatEventEnum.JOIN_REQUEST_EVENT, {
        chatId,
        userId: req.user._id,
        username: req.user.username,
      })
    )
  );

  return res
    .status(200)
    .json(new ApiResponse(200, updatedChat, "Join request submitted successfully"));
});

// New function: Approve or reject a join request
const approveJoinRequest = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.params;
  const { approve } = req.body; // approve: true (approve) or false (reject)

  if (typeof approve !== "boolean") {
    throw new ApiError(400, "Approve must be a boolean value");
  }

  const groupChat = await Chat.findOne({
    _id: chatId,
    isGroupChat: true,
    admins: req.user._id,
  })
    .select("participants pendingJoinRequests admins")
    .lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  const joinRequest = groupChat.pendingJoinRequests.find((req) =>
    req.user.equals(userId)
  );
  if (!joinRequest) {
    throw new ApiError(404, "Join request not found");
  }

  if (approve) {
    // Validate user exists
    const user = await User.findById(userId).select("_id").lean();
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Calculate unread count for the new participant
    const unreadCount = await ChatMessage.countDocuments({
      chat: chatId,
      sender: { $ne: userId },
    });

    // Add user to participants and update unread counts
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        $addToSet: { participants: userId },
        $pull: { pendingJoinRequests: { user: userId } },
        $set: { [`unreadCounts.${userId}`]: unreadCount },
      },
      { new: true, lean: true }
    );

    // Notify existing participants and the new participant
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

    return res
      .status(200)
      .json(new ApiResponse(200, updatedChat, "Join request approved successfully"));
  } else {
    // Reject the join request
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        $pull: { pendingJoinRequests: { user: userId } },
      },
      { new: true, lean: true }
    );

    // Notify the user who was rejected
    await emitSocketEvent(req, userId.toString(), ChatEventEnum.JOIN_REQUEST_REJECTED_EVENT, {
      chatId,
      rejectedBy: req.user._id,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedChat, "Join request rejected successfully"));
  }
});

const getPendingJoinRequests = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  const groupChat = await Chat.findOne({
    _id: chatId,
    isGroupChat: true,
    admins: req.user._id,
  })
    .select("pendingJoinRequests")
    .populate({
      path: "pendingJoinRequests.user",
      select: "username email avatarUrl",
    })
    .lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  const pendingRequests = groupChat.pendingJoinRequests.map((request) => ({
    userId: request.user._id,
    username: request.user.username,
    email: request.user.email,
    avatarUrl: request.user.avatarUrl,
    requestedAt: request.requestedAt,
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, pendingRequests, "Pending join requests fetched successfully"));
});

export {
  getAllGroupChats,
  getGroupChatsForUser,
  markMessageAsRead,
  createGroupChat,
  getGroupChatDetails,
  updateGroupChatDetails,
  addParticipantsToGroup,
  removeParticipantFromGroup,
  leaveGroupChat,
  deleteGroupChat,
  approveJoinRequest,
  requestToJoinGroup,
  getPendingJoinRequests
};

