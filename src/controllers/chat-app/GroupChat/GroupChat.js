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
import admin from "../../../config/firebaseConfig.js"



/**
 * Middleware to check if a user has permission to send messages in a group chat
 */
export const checkGroupMessagePermissions = asyncHandler(async (req, res, next) => {
  const { chatId } = req.params;
  const userId = req.user._id;
  const hasAttachments = req.files?.attachments?.length > 0;

  // Get the group chat with only necessary fields for permission checking
  const groupChat = await GroupChat.findOne({
    _id: chatId,
    isGroupChat: true,
    participants: userId
  }).select('participants admins settings.sendMessagesPermission settings.sendMediaPermission');

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  // Check message sending permissions
  const isAdmin = groupChat.admins.some(adminId => adminId.equals(userId));
  const sendMessagesPermission = groupChat.settings?.sendMessagesPermission || "all";

  if (sendMessagesPermission === "admins" && !isAdmin) {
    throw new ApiError(403, "Only admins can send messages in this group");
  }

  if (sendMessagesPermission === "none") {
    throw new ApiError(403, "Message sending is disabled in this group");
  }

  // Check media sending permissions if attachments are included
  if (hasAttachments) {
    const sendMediaPermission = groupChat.settings?.sendMediaPermission || "all";

    if (sendMediaPermission === "admins" && !isAdmin) {
      throw new ApiError(403, "Only admins can send attachments in this group");
    }

    if (sendMediaPermission === "none") {
      throw new ApiError(403, "Attachment sending is disabled in this group");
    }
  }

  // If all checks pass, proceed to the next middleware/controller
  next();
});

// Common aggregation pipeline for chat queries
// const chatCommonAggregation = (userId) => [
//   // Optimized participant lookup with minimal fields
//   {
//     $lookup: {
//       from: "users",
//       localField: "participants",
//       foreignField: "_id",
//       as: "participants",
//       pipeline: [
//         {
//           $project: {
//             username: 1,
//             avatar: 1,
//             email: 1,
//             isOnline: 1,
//             lastSeen: 1
//           }
//         }
//       ],
//     },
//   },

//   // Enhanced last message lookup with additional metadata
//   {
//     $lookup: {
//       from: "groupchatmessages",
//       localField: "lastMessage",
//       foreignField: "_id",
//       as: "lastMessage",
//       pipeline: [
//         {
//           $lookup: {
//             from: "users",
//             localField: "sender",
//             foreignField: "_id",
//             as: "sender",
//             pipeline: [
//               {
//                 $project: {
//                   username: 1,
//                   avatar: 1,
//                   email: 1,
//                   name: 1
//                 }
//               }
//             ],
//           },
//         },
//         { $unwind: "$sender" },
//         {
//           $addFields: {
//             isEdited: "$edited",
//             hasAttachments: { $gt: [{ $size: "$attachments" }, 0] }
//           }
//         }
//       ],
//     },
//   },
//   {
//     $unwind: {
//       path: "$lastMessage",
//       preserveNullAndEmptyArrays: true
//     }
//   },

//   // Admin lookup with status information
//   {
//     $lookup: {
//       from: "users",
//       localField: "admins",
//       foreignField: "_id",
//       as: "admins",
//       pipeline: [
//         {
//           $project: {
//             username: 1,
//             avatar: 1,
//             email: 1,
//             isOnline: 1
//           }
//         }
//       ],
//     },
//   },

//   // CreatedBy lookup with additional details
//   {
//     $lookup: {
//       from: "users",
//       localField: "createdBy",
//       foreignField: "_id",
//       as: "createdBy",
//       pipeline: [
//         {
//           $project: {
//             username: 1,
//             avatar: 1,
//             email: 1,
//             createdAt: 1
//           }
//         }
//       ],
//     },
//   },
//   {
//     $unwind: {
//       path: "$createdBy",
//       preserveNullAndEmptyArrays: true
//     }
//   },

//   // Enhanced unread count calculation with additional metadata
//   {
//     $addFields: {
//       unreadCount: {
//         $ifNull: [
//           {
//             $let: {
//               vars: {
//                 userUnread: {
//                   $arrayElemAt: [
//                     {
//                       $filter: {
//                         input: "$unreadCounts",
//                         cond: { $eq: ["$$this.user", new mongoose.Types.ObjectId(userId)] },
//                       },
//                     },
//                     0,
//                   ],
//                 },
//               },
//               in: "$$userUnread.count",
//             },
//           },
//           0,
//         ],
//       },
//       hasUnread: { $gt: ["$unreadCount", 0] },
//       sortField: {
//         $ifNull: [
//           "$lastMessage.createdAt",
//           "$lastActivity",
//           "$createdAt"
//         ]
//       },
//       participantCount: { $size: "$participants" },
//       isAdmin: {
//         $in: [new mongoose.Types.ObjectId(userId), "$admins._id"]
//       }
//     },
//   },

//   // Final projection to optimize returned data
//   {
//     $project: {
//       name: 1,
//       avatar: 1,
//       description: 1,
//       participants: 1,
//       admins: 1,
//       createdBy: 1,
//       lastMessage: 1,
//       unreadCount: 1,
//       hasUnread: 1,
//       createdAt: 1,
//       updatedAt: 1,
//       lastActivity: 1,
//       participantCount: 1,
//       isAdmin: 1,
//       settings: 1,
//       isGroupChat: 1
//     }
//   },

//   // Sorting by most recent activity
//   { $sort: { sortField: -1 } }
// ];


const chatCommonAggregation = (userId) => [
  {
    $lookup: {
      from: "users",
      localField: "participants",
      foreignField: "_id",
      as: "participants",
      pipeline: [
        {
          $project: {
            username: 1,
            avatarUrl: 1,
            email: 1,
            online: 1,
            lastSeen: 1,
            avatar: 1
          }
        }
      ],
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
            pipeline: [
              {
                $project: {
                  username: 1,
                  avatarUrl: 1,
                  email: 1,
                  name: 1,
                  avatar: 1
                }
              }
            ],
          },
        },
        { $unwind: "$sender" },
        {
          $addFields: {
            isEdited: "$edited",
            hasAttachments: { $gt: [{ $size: "$attachments" }, 0] }
          }
        }
      ],
    },
  },
  {
    $unwind: {
      path: "$lastMessage",
      preserveNullAndEmptyArrays: true
    }
  },
  {
    $lookup: {
      from: "users",
      localField: "admins",
      foreignField: "_id",
      as: "admins",
      pipeline: [
        {
          $project: {
            username: 1,
            avatarUrl: 1,
            avatar: 1,
            email: 1,
            online: 1
          }
        }
      ],
    },
  },
  {
    $lookup: {
      from: "users",
      localField: "createdBy",
      foreignField: "_id",
      as: "createdBy",
      pipeline: [
        {
          $project: {
            username: 1,
            avatarUrl: 1,
            avatar: 1,
            email: 1,
            createdAt: 1
          }
        }
      ],
    },
  },
  {
    $unwind: {
      path: "$createdBy",
      preserveNullAndEmptyArrays: true
    }
  },
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
                        cond: { $eq: ["$$this.user", new mongoose.Types.ObjectId(userId)] },
                      },
                    },
                    0,
                  ],
                },
              },
              in: "$$userUnread.count",
            },
          },
          0,
        ],
      },
      lastReadMessage: {
        $ifNull: [
          {
            $let: {
              vars: {
                userUnread: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$unreadCounts",
                        cond: { $eq: ["$$this.user", new mongoose.Types.ObjectId(userId)] },
                      },
                    },
                    0,
                  ],
                },
              },
              in: "$$userUnread.lastReadMessage",
            },
          },
          null,
        ],
      },
      hasUnread: { $gt: ["$unreadCount", 0] },
      sortField: {
        $ifNull: [
          "$lastMessage.createdAt",
          "$lastActivity",
          "$createdAt"
        ]
      },
      participantCount: { $size: "$participants" },
      isAdmin: {
        $in: [new mongoose.Types.ObjectId(userId), "$admins._id"]
      }
    },
  },
  {
    $project: {
      name: 1,
      avatar: 1,
      avatarUrl: 1,
      description: 1,
      participants: 1,
      admins: 1,
      createdBy: 1,
      lastMessage: 1,
      unreadCount: 1,
      lastReadMessage: 1,
      hasUnread: 1,
      createdAt: 1,
      updatedAt: 1,
      lastActivity: 1,
      participantCount: 1,
      isAdmin: 1,
      settings: 1,
      isGroupChat: 1
    }
  },
  { $sort: { sortField: -1 } }
];

async function sendGroupNotification(
  userId,
  title,
  message,
  chatId,
  messageId,
  senderId,
  senderName,
  senderAvatar,
  hasAttachments = false
) {
  // Get user with their notification settings
  const user = await User.findById(userId).select('deviceToken notificationSettings isOnline');

  // Check if user should receive notification
  if (!user) {
    console.error("User not found:", userId);
    return;
  }

  // Check if user has device token
  if (!user.deviceToken) {
    console.error("No device token found for user:", userId);
    return;
  }

  // Check notification settings if available
  if (user.notificationSettings) {
    const groupChatSetting = user.notificationSettings.groupChats;
    if (groupChatSetting === 'none') {
      console.log(`User ${userId} has disabled group chat notifications`);
      return;
    }
    if (groupChatSetting === 'mentions_only') {
      // For group chats, we would need to check if message mentions this user
      // This would require passing the message content or mentions array
      console.log(`User ${userId} only wants mentions, but mentions check not implemented`);
      return;
    }
  }

  // Skip if user is online (optional)
  if (user.isOnline) {
    console.log(`User ${userId} is online, skipping notification`);
    return;
  }

  // Prepare notification payload
  const payload = {
    android: {
      priority: 'high',
      notification: {
        title: title,
        body: message,
        icon: senderAvatar || 'default', // Use default if no avatar
        // Add other Android-specific options
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1, // Increment badge count
          // Add other iOS-specific options
        },
      },
    },
    data: {
      screen: 'Group_Chat', // The screen name for group chat
      params: JSON.stringify({
        chatId: chatId,
        messageId: messageId,
        type: 'group_message',
        senderId: senderId,
        senderName: senderName,
        senderAvatar: senderAvatar || '',
        hasAttachments: hasAttachments.toString(),
        // Include any other parameters your GroupChat screen needs
      }),
      click_action: 'FLUTTER_NOTIFICATION_CLICK', // Important for Flutter
    },
    token: user.deviceToken,
  };

  try {
    const response = await admin.messaging().send(payload);
    console.log("Group notification sent successfully to user:", userId, response);
  } catch (error) {
    console.error("Error sending group notification to user:", userId, error);

    // Handle token cleanup if needed
    if (error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered') {
      console.log(`Removing invalid token for user ${userId}`);
      await User.updateOne(
        { _id: userId },
        { $unset: { deviceToken: 1 } }
      );
    }
  }
}

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
    GroupChatMessage.countDocuments({
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




const updateUnreadCounts = async (chatId, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Get the last message in the chat
    const lastMessage = await GroupChatMessage.findOne({ chat: chatId })
      .sort({ createdAt: -1 })
      .select('_id')
      .lean();

    if (!lastMessage) {
      await session.abortTransaction();
      return;
    }

    // Count unread messages (messages after the last read message)
    const unreadCount = await GroupChatMessage.countDocuments({
      chat: chatId,
      createdAt: { $gt: new Date() }, // This needs to be adjusted based on your lastReadMessage
      sender: { $ne: userId },
      seenBy: { $ne: userId }
    });

    // Update the unread count for the user
    await GroupChat.updateOne(
      { _id: chatId },
      {
        $set: {
          "unreadCounts.$[elem].count": unreadCount,
          "unreadCounts.$[elem].lastReadMessage": lastMessage._id
        }
      },
      {
        arrayFilters: [{ "elem.user": userId }],
        session
      }
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    console.error('Error updating unread counts:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

const getTotalUnreadCount = async (userId) => {
  const result = await GroupChat.aggregate([
    {
      $match: {
        participants: userId,
        isGroupChat: true
      }
    },
    {
      $unwind: "$unreadCounts"
    },
    {
      $match: {
        "unreadCounts.user": userId
      }
    },
    {
      $group: {
        _id: null,
        totalUnread: { $sum: "$unreadCounts.count" }
      }
    }
  ]);

  return result.length > 0 ? result[0].totalUnread : 0;
};


/**
 * @route GET /api/v1/chats/group/:chatId/messages
 * @description Get all messages for a group chat with pagination
 */


// const getAllGroupMessages = asyncHandler(async (req, res) => {
//   const { chatId } = req.params;
//   let { page = 1, limit = 20 } = req.query;

//   page = parseInt(page);
//   limit = parseInt(limit);

//   if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
//     throw new ApiError(400, "Invalid page or limit parameters");
//   }

//   // Verify user is a participant
//   const isParticipant = await GroupChat.exists({
//     _id: chatId,
//     isGroupChat: true,
//     participants: req.user._id
//   });

//   if (!isParticipant) {
//     throw new ApiError(404, "Group chat not found or you're not a participant");
//   }

//   // Get paginated messages
//   const { messages, totalCount, totalPages } = await getPaginatedMessages(
//     chatId,
//     req.user._id,
//     page,
//     limit
//   );

//   // Mark messages as read in bulk
//   await Promise.all([
//     GroupChatMessage.updateMany(
//       {
//         chat: chatId,
//         seenBy: { $ne: req.user._id },
//         sender: { $ne: req.user._id }
//       },
//       { $addToSet: { seenBy: req.user._id }, $set: { isRead: true } }
//     ),
//     GroupChat.updateOne(
//       { _id: chatId, "unreadCounts.user": req.user._id },
//       { $set: { "unreadCounts.$.count": 0 } }
//     )
//   ]);

//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       { messages, page, limit, totalCount, totalPages },
//       "Group messages fetched successfully"
//     )
//   );
// });

/**
 * @route POST /api/v1/chats/group/:chatId/messages
 * @description Send a message to a group chat
 */


// const sendGroupMessage = asyncHandler(async (req, res) => {
//   const { chatId } = req.params;
//   const { content, replyTo } = req.body;

//   if (!content && !req.files?.attachments?.length) {
//     throw new ApiError(400, "Message content or attachment is required");
//   }

//   // Get group chat in single query
//   const groupChat = await GroupChat.findOneAndUpdate(
//     {
//       _id: chatId,
//       isGroupChat: true,
//       participants: req.user._id
//     },
//     { $set: { lastActivity: new Date() } },
//     { new: true }
//   ).populate({
//     path: 'participants',
//     select: '_id username name email deviceToken',
//     match: { _id: { $ne: req.user._id } } // Exclude the sender
//   });

//   if (!groupChat) {
//     throw new ApiError(404, "Group chat not found or you're not a participant");
//   }

//   // Process attachments
//   const messageFiles = (req.files?.attachments || []).map((attachment) => ({
//     url: getStaticFilePath(req, attachment.filename),
//     localPath: getLocalPath(attachment.filename),
//     fileType: attachment.mimetype.split("/")[0] || "other",
//     fileName: attachment.originalname,
//     size: attachment.size,
//     ...(attachment.mimetype.startsWith('image/') || attachment.mimetype.startsWith('video/')) && {
//       dimensions: {
//         width: 0, // You'll need to extract these from the file
//         height: 0
//       }
//     },
//     ...(attachment.mimetype.startsWith('audio/') || attachment.mimetype.startsWith('video/')) && {
//       duration: 0 // You'll need to extract this from the file
//     }
//   }));

//   // Prepare message data
//   const messageData = {
//     sender: req.user._id,
//     content: content || "",
//     chat: chatId,
//     attachments: messageFiles
//   };

//   // Handle replyTo if provided
//   if (replyTo) {
//     const repliedMessage = await GroupChatMessage.findOne({
//       _id: replyTo,
//       chat: chatId
//     })
//       .select('sender content attachments createdAt')
//       .lean();

//     if (!repliedMessage) {
//       throw new ApiError(400, "Replied message not found in this chat");
//     }

//     messageData.replyTo = {
//       messageId: repliedMessage._id,
//       sender: repliedMessage.sender,
//       content: repliedMessage.content,
//       attachments: repliedMessage.attachments.map(att => ({
//         url: att.url,
//         fileType: att.fileType,
//         thumbnailUrl: att.thumbnailUrl
//       })),
//       originalCreatedAt: repliedMessage.createdAt
//     };
//   }

//   // Create the message
//   const message = await GroupChatMessage.create(messageData);

//   // Prepare update operations for unread counts
//   const participantsToUpdate = groupChat.participants
//     .filter(p => p._id.toString() !== req.user._id.toString())
//     .map(p => p._id.toString());

//   const updateOps = {
//     $set: { lastMessage: message._id },
//     $inc: {
//       ...participantsToUpdate.reduce((acc, p) => {
//         acc[`unreadCounts.${p}.count`] = 1;
//         return acc;
//       }, {})
//     }
//   };

//   await GroupChat.findByIdAndUpdate(chatId, updateOps);

//   // Get populated message in single aggregation
//   const [populatedMessage] = await GroupChatMessage.aggregate([
//     { $match: { _id: message._id } },
//     {
//       $lookup: {
//         from: "users",
//         localField: "sender",
//         foreignField: "_id",
//         as: "sender",
//         pipeline: [{ $project: { username: 1, avatar: 1, email: 1 } }]
//       }
//     },
//     { $unwind: "$sender" },
//     {
//       $lookup: {
//         from: "groupchatmessages",
//         localField: "replyTo.messageId",
//         foreignField: "_id",
//         as: "replyToMessage",
//         pipeline: [
//           {
//             $lookup: {
//               from: "users",
//               localField: "sender",
//               foreignField: "_id",
//               as: "sender",
//               pipeline: [{ $project: { username: 1, avatar: 1 } }]
//             }
//           },
//           { $unwind: "$sender" },
//           { $project: { content: 1, sender: 1, attachments: 1, createdAt: 1 } }
//         ]
//       }
//     },
//     { $unwind: { path: "$replyToMessage", preserveNullAndEmptyArrays: true } },
//     {
//       $addFields: {
//         replyTo: {
//           $cond: {
//             if: { $ifNull: ["$replyTo", false] },
//             then: {
//               messageId: "$replyTo.messageId",
//               sender: "$replyTo.sender",
//               content: "$replyTo.content",
//               attachments: "$replyTo.attachments",
//               originalCreatedAt: "$replyTo.originalCreatedAt",
//               repliedMessage: "$replyToMessage"
//             },
//             else: null
//           }
//         }
//       }
//     },
//     { $project: { replyToMessage: 0 } }
//   ]);

//   if (!populatedMessage) {
//     throw new ApiError(500, "Failed to send message");
//   }

//   // Get sender info for notifications
//   const sender = await User.findById(req.user._id)
//     .select("username name avatar")
//     .lean();

//   const senderName = sender.name || sender.username;
//   const notificationMessage = content
//     ? `${senderName}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`
//     : `${senderName} sent an attachment`;

//   // Prepare notification data
//   const notificationData = {
//     title: groupChat.name || `Group Chat`,
//     body: notificationMessage,
//     data: {
//       chatId: chatId.toString(),
//       name: groupChat.name || `Group Chat`,
//       messageId: message._id.toString(),
//       type: 'group_message',
//       click_action: 'FLUTTER_NOTIFICATION_CLICK'
//     },
//     icon: sender.avatar || null
//   };

//   // Send notifications to all participants except sender
//   const notificationPromises = groupChat.participants
//     .filter(participant =>
//       participant._id.toString() !== req.user._id.toString() &&
//       participant.deviceToken &&
//       typeof participant.deviceToken === 'string' &&
//       participant.deviceToken.trim() !== ''
//     )


//     .map(async (participant) => {
//       console.log(`Sending notification to user ${participant.deviceToken}`);
//       try {
//         await sendFirebaseNotification(
//           [participant.deviceToken], // Pass as array
//           notificationData
//         );
//       } catch (error) {
//         console.error(`Failed to send notification to user ${participant._id}:`, error);
//         // Optionally remove invalid tokens here
//       }
//     });

//   // Emit socket events to participants
//   const socketEvents = groupChat.participants
//     .filter(p => p._id.toString() !== req.user._id.toString())
//     .map(participant =>
//       emitSocketEvent(
//         req,
//         participant._id.toString(),
//         ChatEventEnum.MESSAGE_RECEIVED_EVENT,
//         populatedMessage
//       )
//     );

//   // Run notifications and socket events in parallel
//   await Promise.all([...notificationPromises, ...socketEvents]);

//   return res
//     .status(201)
//     .json(new ApiResponse(201, populatedMessage, "Message sent successfully"));
// });


const sendGroupMessage = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { content, replyTo } = req.body;

  if (!content && !req.files?.attachments?.length) {
    throw new ApiError(400, "Message content or attachment is required");
  }

  // Get group chat and update last activity
  const groupChat = await GroupChat.findOneAndUpdate(
    {
      _id: chatId,
      isGroupChat: true,
      participants: req.user._id
    },
    { $set: { lastActivity: new Date() } },
    { new: true }
  ).populate({
    path: 'participants',
    select: '_id username name email deviceToken',
    match: { _id: { $ne: req.user._id } } // Exclude the sender
  });

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  // Process attachments
  const messageFiles = (req.files?.attachments || []).map((attachment) => ({
    url: getStaticFilePath(req, attachment.filename),
    localPath: getLocalPath(attachment.filename),
    fileType: attachment.mimetype.split("/")[0] || "other",
    fileName: attachment.originalname,
    size: attachment.size,
    ...(attachment.mimetype.startsWith('image/') || attachment.mimetype.startsWith('video/')) && {
      dimensions: {
        width: 0, // You'll need to extract these from the file
        height: 0
      }
    },
    ...(attachment.mimetype.startsWith('audio/') || attachment.mimetype.startsWith('video/')) && {
      duration: 0 // You'll need to extract this from the file
    }
  }));

  // Prepare message data
  const messageData = {
    sender: req.user._id,
    content: content || "",
    chat: chatId,
    attachments: messageFiles
  };

  // Handle replyTo if provided
  if (replyTo) {
    const repliedMessage = await GroupChatMessage.findOne({
      _id: replyTo,
      chat: chatId
    })
      .select('sender content attachments createdAt')
      .lean();

    if (!repliedMessage) {
      throw new ApiError(400, "Replied message not found in this chat");
    }

    messageData.replyTo = {
      messageId: repliedMessage._id,
      sender: repliedMessage.sender,
      content: repliedMessage.content,
      attachments: repliedMessage.attachments.map(att => ({
        url: att.url,
        fileType: att.fileType,
        thumbnailUrl: att.thumbnailUrl
      })),
      originalCreatedAt: repliedMessage.createdAt
    };
  }

  // Create the message
  const message = await GroupChatMessage.create(messageData);

  // Prepare update operations for unread counts
  const participantsToUpdate = groupChat.participants
    .filter(p => p._id.toString() !== req.user._id.toString())
    .map(p => p._id);

  // Update unread counts for all participants except sender
  const updateUnreadCounts = participantsToUpdate.map(userId => ({
    updateOne: {
      filter: {
        _id: chatId,
        "unreadCounts.user": userId
      },
      update: {
        $inc: { "unreadCounts.$.count": 1 },
        $set: { lastMessage: message._id }
      }
    }
  }));

  // For participants who don't have an unreadCounts entry yet
  const addUnreadCounts = participantsToUpdate.map(userId => ({
    updateOne: {
      filter: {
        _id: chatId,
        "unreadCounts.user": { $ne: userId }
      },
      update: {
        $push: {
          unreadCounts: {
            user: userId,
            count: 1,
            lastReadMessage: null
          }
        },
        $set: { lastMessage: message._id }
      }
    }
  }));

  // Execute all updates in bulk
  await GroupChat.bulkWrite([
    ...updateUnreadCounts,
    ...addUnreadCounts
  ]);

  // Get populated message in single aggregation
  const [populatedMessage] = await GroupChatMessage.aggregate([
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
              pipeline: [{ $project: { username: 1, avatar: 1 } }]
            }
          },
          { $unwind: "$sender" },
          { $project: { content: 1, sender: 1, attachments: 1, createdAt: 1 } }
        ]
      }
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
              repliedMessage: "$replyToMessage"
            },
            else: null
          }
        }
      }
    },
    { $project: { replyToMessage: 0 } }
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

  // Prepare notification data
  const notificationData = {
    title: groupChat.name || `Group Chat`,
    body: notificationMessage,
    data: {
      chatId: chatId.toString(),
      name: groupChat.name || `Group Chat`,
      messageId: message._id.toString(),
      type: 'group_message',
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    },
    icon: sender.avatar || null
  };

  // Send notifications to all participants except sender
  const notificationPromises = groupChat.participants
    .filter(participant =>
      participant._id.toString() !== req.user._id.toString() &&
      participant.deviceToken &&
      typeof participant.deviceToken === 'string' &&
      participant.deviceToken.trim() !== ''
    )
    .map(async (participant) => {
      console.log(`Sending notification to user ${participant._id}`);
      try {
        await sendFirebaseNotification(
          [participant.deviceToken], // Pass as array
          notificationData
        );
      } catch (error) {
        console.error(`Failed to send notification to user ${participant._id}:`, error);
      }
    });

  // Emit socket events to participants
  const socketEvents = groupChat.participants
    .filter(p => p._id.toString() !== req.user._id.toString())
    .map(participant =>
      emitSocketEvent(
        req,
        participant._id.toString(),
        ChatEventEnum.MESSAGE_RECEIVED_EVENT,
        populatedMessage
      )
    );

  // Run notifications and socket events in parallel
  await Promise.all([...notificationPromises, ...socketEvents]);

  return res
    .status(201)
    .json(new ApiResponse(201, populatedMessage, "Message sent successfully"));
});

const sendFirebaseNotification = async (tokens, notificationData) => {
  console.log('Sending notification to tokens:', tokens);
  if (!Array.isArray(tokens) || tokens.length === 0) {
    console.warn('No valid tokens provided for notification.');
    return;
  }

  const cleanedTokens = tokens.filter(token => typeof token === 'string' && token.trim() !== '');
  if (cleanedTokens.length === 0) {
    console.warn('All tokens are empty or invalid strings.');
    return;
  }

  const message = {
    notification: {
      title: notificationData.title || '',
      body: notificationData.body || ''
    },
    data: {
      ...notificationData.data,
      screen: 'Group_Chat',

    },
    tokens: cleanedTokens,
    android: {
      priority: 'high'
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    }
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log('Firebase notification response:', response);
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(cleanedTokens[idx]);
        }
      });
      console.warn('Some tokens failed:', failedTokens);
    }

    return response;
  } catch (error) {
    console.error('Error sending Firebase notification:', error);
    throw error;
  }
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
          // Preserve unreadCount for joined groups, set to 0 for non-joined
          unreadCount: {
            $cond: {
              if: { $in: [req.user._id, "$participants"] },
              then: "$unreadCount",
              else: 0,
            },
          },
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

  const [groupChats, totalCount, totalUnreadCount] = await Promise.all([
    GroupChat.aggregate([
      { $match: matchStage },
      ...chatCommonAggregation(req.user._id),
      { $sort: { updatedAt: -1 } }, // Changed from sortField to updatedAt
      { $skip: skip },
      { $limit: limitNum },
      {
        $project: {
          name: 1,
          avatar: 1,
          description: 1,
          participants: 1,
          admins: 1,
          createdBy: 1,
          lastMessage: 1,
          unreadCount: 1,
          lastReadMessage: 1,
          createdAt: 1,
          lastActivity: 1,
          updatedAt: 1, // Make sure updatedAt is included if you want it in the response
        },
      },
    ]),
    GroupChat.countDocuments(matchStage),
    getTotalUnreadCount(req.user._id)
  ]);

  const totalPages = Math.ceil(totalCount / limitNum);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        groupChats,
        totalUnreadCount,
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
      },
      "Group chats fetched successfully"
    )
  );
});

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
    participants: req.user._id
  });

  if (!isParticipant) {
    throw new ApiError(404, "Group chat not found or you're not a participant");
  }

  const [messages, totalCount] = await Promise.all([
    GroupChatMessage.aggregate([
      { $match: { chat: new mongoose.Types.ObjectId(chatId) } },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
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
                pipeline: [{ $project: { username: 1, avatar: 1 } }]
              }
            },
            { $unwind: "$sender" },
            { $project: { content: 1, sender: 1, attachments: 1, createdAt: 1 } }
          ]
        }
      },
      { $unwind: { path: "$replyToMessage", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          replyTo: {
            $cond: {
              if: { $ifNull: ["$replyTo", false] },
              then: {
                messageId: "$replyTo.messageId",
                sender: {
                  _id: "$replyTo.sender",
                  username: { $ifNull: ["$replyToMessage.sender.username", "Unknown"] }
                },
                content: "$replyTo.content",
                attachments: "$replyTo.attachments",
                originalCreatedAt: "$replyTo.originalCreatedAt",
                repliedMessage: "$replyToMessage"
              },
              else: null
            }
          }
        }
      },
      { $project: { replyToMessage: 0 } },
      { $sort: { createdAt: 1 } }
    ]),
    GroupChatMessage.countDocuments({ chat: chatId })
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  // Mark messages as read and update unread counts
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  await Promise.all([
    GroupChatMessage.updateMany(
      {
        chat: chatId,
        seenBy: { $ne: req.user._id },
        sender: { $ne: req.user._id }
      },
      { $addToSet: { seenBy: req.user._id }, $set: { isRead: true } }
    ),
    GroupChat.updateOne(
      { _id: chatId, "unreadCounts.user": req.user._id },
      {
        $set: {
          "unreadCounts.$.count": 0,
          "unreadCounts.$.lastReadMessage": lastMessage?._id || null
        }
      }
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



// const getAllGroupMessages = asyncHandler(async (req, res) => {
//   const { chatId } = req.params;
//   let { page = 1, limit = 20 } = req.query;

//   page = parseInt(page);
//   limit = parseInt(limit);

//   if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
//     throw new ApiError(400, "Invalid page or limit parameters");
//   }

//   // Verify user is a participant
//   const isParticipant = await GroupChat.exists({
//     _id: chatId,
//     isGroupChat: true,
//     participants: req.user._id
//   });

//   if (!isParticipant) {
//     throw new ApiError(404, "Group chat not found or you're not a participant");
//   }

//   // Get paginated messages with reply information including username
//   const messages = await GroupChatMessage.aggregate([
//     { $match: { chat: new mongoose.Types.ObjectId(chatId) } },
//     { $sort: { createdAt: -1 } },
//     { $skip: (page - 1) * limit },
//     { $limit: limit },
//     {
//       $lookup: {
//         from: "users",
//         localField: "sender",
//         foreignField: "_id",
//         as: "sender",
//         pipeline: [{ $project: { username: 1, avatar: 1, email: 1 } }]
//       }
//     },
//     { $unwind: "$sender" },
//     {
//       $lookup: {
//         from: "groupchatmessages",
//         localField: "replyTo.messageId",
//         foreignField: "_id",
//         as: "replyToMessage",
//         pipeline: [
//           {
//             $lookup: {
//               from: "users",
//               localField: "sender",
//               foreignField: "_id",
//               as: "sender",
//               pipeline: [{ $project: { username: 1, avatar: 1 } }]
//             }
//           },
//           { $unwind: "$sender" },
//           { $project: { content: 1, sender: 1, attachments: 1, createdAt: 1 } }
//         ]
//       }
//     },
//     { $unwind: { path: "$replyToMessage", preserveNullAndEmptyArrays: true } },
//     {
//       $addFields: {
//         replyTo: {
//           $cond: {
//             if: { $ifNull: ["$replyTo", false] },
//             then: {
//               messageId: "$replyTo.messageId",
//               sender: {
//                 _id: "$replyTo.sender",
//                 username: { $ifNull: ["$replyToMessage.sender.username", "Unknown"] }
//               },
//               content: "$replyTo.content",
//               attachments: "$replyTo.attachments",
//               originalCreatedAt: "$replyTo.originalCreatedAt",
//               repliedMessage: "$replyToMessage"
//             },
//             else: null
//           }
//         }
//       }
//     },
//     { $project: { replyToMessage: 0 } },
//     { $sort: { createdAt: 1 } } // Restore original chronological order
//   ]);

//   // Get total count for pagination
//   const totalCount = await GroupChatMessage.countDocuments({ chat: chatId });
//   const totalPages = Math.ceil(totalCount / limit);

//   // Mark messages as read in bulk
//   await Promise.all([
//     GroupChatMessage.updateMany(
//       {
//         chat: chatId,
//         seenBy: { $ne: req.user._id },
//         sender: { $ne: req.user._id }
//       },
//       { $addToSet: { seenBy: req.user._id }, $set: { isRead: true } }
//     ),
//     GroupChat.updateOne(
//       { _id: chatId, "unreadCounts.user": req.user._id },
//       { $set: { "unreadCounts.$.count": 0 } }
//     )
//   ]);

//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       { messages, page, limit, totalCount, totalPages },
//       "Group messages fetched successfully"
//     )
//   );
// });

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
  const [groupChat] = await GroupChat.aggregate([
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
    GroupChatMessage.updateMany(
      {
        chat: chatId,
        seenBy: { $ne: req.user._id },
        sender: { $ne: req.user._id }
      },
      { $addToSet: { seenBy: req.user._id }, $set: { isRead: true } }
    ),
    GroupChat.updateOne(
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
  const { name, participants, avatar } = req.body;

  if (!name?.trim() || !Array.isArray(participants) || participants.length < 2) {
    throw new ApiError(400, "Name and at least two participants are required");
  }

  // Validate participants
  const participantIds = [...new Set([
    req.user._id,
    ...participants.map(id => new mongoose.Types.ObjectId(id))
  ])];

  // Fetch all users at once for validation and notifications
  const users = await User.find({ _id: { $in: participantIds } }).select('_id deviceToken');
  if (users.length !== participantIds.length) {
    throw new ApiError(404, "One or more users not found");
  }

  // Create group chat with initial unread counts
  const groupChat = await GroupChat.create({
    name: name.trim(),
    isGroupChat: true,
    avatar: avatar || null,
    participants: participantIds,
    admins: [req.user._id],
    createdBy: req.user._id,
    unreadCounts: participantIds
      .filter(id => !id.equals(req.user._id))
      .map(user => ({ user, count: 1 })),
    lastActivity: new Date()
  });

  // Get populated group chat
  const [createdGroupChat] = await GroupChat.aggregate([
    { $match: { _id: groupChat._id } },
    ...chatCommonAggregation(req.user._id),
  ]);

  if (!createdGroupChat) {
    throw new ApiError(500, "Failed to create group chat");
  }

  // Notify participants via socket
  const socketNotifications = createdGroupChat.participants
    .filter(p => !p._id.equals(req.user._id))
    .map(participant => {
      try {
        return emitSocketEvent(
          req,
          participant._id.toString(),
          ChatEventEnum.NEW_GROUP_CHAT_EVENT,
          createdGroupChat
        );
      } catch (error) {
        console.error('Socket notification failed:', error);
        return null;
      }
    });

  // Send Firebase notifications to participants
  const pushNotifications = users
    .filter(user =>
      !user._id.equals(req.user._id) &&
      user.deviceToken
    )
    .map(async (user) => {
      try {
        const message = {
          notification: {
            title: 'New Group Chat',
            body: `You've been added to the group "${name.trim()}"`,
          },
          token: user.deviceToken,
          data: {
            chatId: createdGroupChat._id.toString(),
            type: 'group_chat_created',
          },
        };
        await admin.messaging().send(message);
      } catch (error) {
        console.error('Failed to send FCM notification to user:', user._id, error);
      }
    });

  // Wait for all notifications to complete (but don't fail if some fail)
  await Promise.allSettled([...socketNotifications, ...pushNotifications]);

  return res
    .status(201)
    .json(new ApiResponse(201, createdGroupChat, "Group chat created successfully"));
});

/**
 * @route PUT /api/v1/chats/group/:chatId
 * @description Update group chat details (name, avatar)
 */
// const updateGroupChatDetails = asyncHandler(async (req, res) => {
//   const { chatId } = req.params;
//   const { name, description, avatar } = req.body;

//   if (!name?.trim() && !description?.trim()) {
//     throw new ApiError(400, "At least one field to update is required");
//   }

//   const updateFields = {};
//   if (name?.trim()) updateFields.name = name.trim();
//   if (description?.trim()) updateFields.description = description.trim();
//   updateFields.lastActivity = new Date();

//   const updatedGroupChat = await GroupChat.findOneAndUpdate(
//     { _id: chatId, isGroupChat: true, admins: req.user._id },
//     { $set: updateFields },
//     { new: true, lean: true }
//   );

//   if (!updatedGroupChat) {
//     throw new ApiError(404, "Group chat not found or you're not an admin");
//   }

//   // Notify all participants
//   const notificationEvents = updatedGroupChat.participants.map(pId =>
//     emitSocketEvent(
//       req,
//       pId.toString(),
//       ChatEventEnum.UPDATE_GROUP_EVENT,
//       updatedGroupChat
//     )
//   );

//   await Promise.all(notificationEvents);

//   await sendGroupNotifications(req, {
//     chatId,
//     participants: updatedGroupChat.participants.map(p => p._id),
//     eventType: ChatEventEnum.UPDATE_GROUP_EVENT,
//     data: updatedGroupChat
//   });

//   return res
//     .status(200)
//     .json(new ApiResponse(200, updatedGroupChat, "Group updated successfully"));
// });


const updateGroupChatDetails = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { name, description, avatar } = req.body;

  // Check if at least one field is provided for update
  if (!name?.trim() && !description?.trim() && !avatar?.trim()) {
    throw new ApiError(400, "At least one field to update is required");
  }

  const updateFields = {};
  if (name?.trim()) updateFields.name = name.trim();
  if (description?.trim()) updateFields.description = description.trim();
  if (avatar?.trim()) updateFields.avatar = avatar.trim();
  updateFields.lastActivity = new Date();

  const updatedGroupChat = await GroupChat.findOneAndUpdate(
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

  await sendGroupNotifications(req, {
    chatId,
    participants: updatedGroupChat.participants.map(p => p._id),
    eventType: ChatEventEnum.UPDATE_GROUP_EVENT,
    data: updatedGroupChat
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updatedGroupChat, "Group updated successfully"));
});
/**
 * @route PUT /api/v1/chats/group/:chatId/add
 * @description Add participants to a group chat
 */
// const addParticipantsToGroup = asyncHandler(async (req, res) => {
//   const { chatId } = req.params;
//   const { participants } = req.body;

//   if (!Array.isArray(participants) || participants.length === 0) {
//     throw new ApiError(400, "Participants array is required");
//   }

//   // Get group chat and validate admin status
//   const groupChat = await GroupChat.findOne({
//     _id: chatId,
//     isGroupChat: true,
//     admins: req.user._id
//   }).lean();

//   if (!groupChat) {
//     throw new ApiError(404, "Group chat not found or you're not an admin");
//   }

//   // Filter out existing participants
//   const newParticipants = participants
//     .map(id => new mongoose.Types.ObjectId(id))
//     .filter(p => !groupChat.participants.some(existing => existing.equals(p)));

//   if (newParticipants.length === 0) {
//     throw new ApiError(400, "All users are already in the group");
//   }

//   // Validate users exist
//   const usersCount = await User.countDocuments({ _id: { $in: newParticipants } });
//   if (usersCount !== newParticipants.length) {
//     throw new ApiError(404, "One or more users not found");
//   }

//   // Calculate unread counts for new participants
//   const unreadCounts = await GroupChatMessage.aggregate([
//     {
//       $match: {
//         chat: new mongoose.Types.ObjectId(chatId),
//         sender: { $nin: newParticipants }
//       }
//     },
//     {
//       $group: {
//         _id: null,
//         count: { $sum: 1 }
//       }
//     }
//   ]);

//   const totalUnread = unreadCounts[0]?.count || 0;

//   // Prepare updates
//   const updates = {
//     $addToSet: { participants: { $each: newParticipants } },
//     $push: {
//       unreadCounts: {
//         $each: newParticipants.map(user => ({ user, count: totalUnread }))
//       }
//     },
//     $set: { lastActivity: new Date() }
//   };

//   const updatedGroupChat = await GroupChat.findByIdAndUpdate(
//     chatId,
//     updates,
//     { new: true, lean: true }
//   );


//   // Get sender info for notifications
//   const sender = await User.findById(req.user._id)
//     .select("username name avatar")
//     .lean();

//   const senderName = sender.name || sender.username;
//   const notificationMessage = content
//     ? `${senderName}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`
//     : `${senderName} sent an attachment`;

//   // Prepare notification data
//   const notificationData = {
//     title: groupChat.name || `Group Chat`,
//     body: notificationMessage,
//     data: {
//       chatId: chatId.toString(),
//       name: groupChat.name || `Group Chat`,
//       messageId: message._id.toString(),
//       type: 'group_message',
//       click_action: 'FLUTTER_NOTIFICATION_CLICK'
//     },
//     icon: sender.avatar || null
//   };

//   // Send notifications to all participants except sender
//   const notificationPromises = groupChat.participants
//     .filter(participant =>
//       participant._id.toString() !== req.user._id.toString() &&
//       participant.deviceToken &&
//       typeof participant.deviceToken === 'string' &&
//       participant.deviceToken.trim() !== ''
//     )
//     .map(async (participant) => {
//       console.log(`Sending notification to user ${participant._id}`);
//       try {
//         await sendFirebaseNotification(
//           [participant.deviceToken], // Pass as array
//           notificationData
//         );
//       } catch (error) {
//         console.error(`Failed to send notification to user ${participant._id}:`, error);
//       }
//     });
//   // Notify existing participants and new members
//   const notificationEvents = [
//     ...groupChat.participants.map(pId =>
//       emitSocketEvent(
//         req,
//         pId.toString(),
//         ChatEventEnum.UPDATE_GROUP_EVENT,
//         updatedGroupChat
//       )
//     ),
//     ...newParticipants.map(pId =>
//       emitSocketEvent(
//         req,
//         pId.toString(),
//         ChatEventEnum.NEW_GROUP_CHAT_EVENT,
//         updatedGroupChat
//       )
//     )
//   ];

//   await Promise.all(notificationEvents);

//   return res
//     .status(200)
//     .json(new ApiResponse(200, updatedGroupChat, "Participants added successfully"));
// });

const addParticipantsToGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { participants } = req.body;

  if (!Array.isArray(participants) || participants.length === 0) {
    throw new ApiError(400, "Participants array is required");
  }

  // Get group chat and validate admin status
  const groupChat = await GroupChat.findOne({
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
  const unreadCounts = await GroupChatMessage.aggregate([
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

  const updatedGroupChat = await GroupChat.findByIdAndUpdate(
    chatId,
    updates,
    { new: true, lean: true }
  );

  // Get sender info for notifications
  const sender = await User.findById(req.user._id)
    .select("username name avatar")
    .lean();

  const senderName = sender.name || sender.username;
  const notificationMessage = `You've been added to "${groupChat.name}" by ${senderName}`;

  // Get device tokens for new participants
  const newUsers = await User.find({
    _id: { $in: newParticipants },
    deviceToken: { $exists: true, $ne: null }
  }).select('deviceToken');

  // Prepare notification data
  const notificationData = {
    title: `Added to ${groupChat.name}`,
    body: notificationMessage,
    data: {
      chatId: chatId.toString(),
      groupName: groupChat.name,
      type: 'group_added',
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    },
    icon: sender.avatar || null
  };

  // Send notifications to new participants
  const notificationPromises = newUsers
    .filter(user => user.deviceToken && typeof user.deviceToken === 'string')
    .map(async (user) => {
      console.log(`Sending notification to user ${user._id}`);
      try {
        await sendFirebaseNotification(
          [user.deviceToken.trim()], // Ensure token is clean and in array
          notificationData
        );
      } catch (error) {
        console.error(`Failed to send notification to user ${user._id}:`, error);
      }
    });

  await Promise.all(notificationPromises);

  // Notify existing participants and new members via sockets
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
// const removeParticipantFromGroup = asyncHandler(async (req, res) => {
//   const { chatId } = req.params;
//   const { participantId } = req.body;

//   if (!participantId) {
//     throw new ApiError(400, "Participant ID is required");
//   }

//   // Validate participant ID format
//   let participantObjectId;
//   try {
//     participantObjectId = new mongoose.Types.ObjectId(participantId);
//   } catch (err) {
//     throw new ApiError(400, "Invalid participant ID format");
//   }

//   // Get group chat and validate admin status
//   const groupChat = await GroupChat.findOne({
//     _id: chatId,
//     isGroupChat: true,
//     admins: req.user._id
//   }).lean();

//   if (!groupChat) {
//     throw new ApiError(404, "Group chat not found or you're not an admin");
//   }

//   // Check if participant is in the group
//   if (!groupChat.participants.some(p => p.equals(participantObjectId))) {
//     throw new ApiError(400, "User is not in this group");
//   }

//   if (participantObjectId.equals(req.user._id)) {
//     throw new ApiError(400, "Use leave group endpoint instead");
//   }

//   // Remove participant
//   const updatedGroupChat = await GroupChat.findByIdAndUpdate(
//     chatId,
//     {
//       $pull: {
//         participants: participantObjectId,
//         admins: participantObjectId,
//         unreadCounts: { user: participantObjectId }
//       },
//       $set: { lastActivity: new Date() }
//     },
//     { new: true, lean: true }
//   );

//   // Notify participants and removed user
//   await Promise.all([
//     ...updatedGroupChat.participants.map(pId =>
//       emitSocketEvent(
//         req,
//         pId.toString(),
//         ChatEventEnum.UPDATE_GROUP_EVENT,
//         updatedGroupChat
//       )
//     ),
//     emitSocketEvent(
//       req,
//       participantId,
//       ChatEventEnum.REMOVED_FROM_GROUP_EVENT,
//       {
//         chatId,
//         removedBy: req.user._id,
//       }
//     )
//   ]);


//   // Notify remaining participants
//   await sendGroupNotifications(req, {
//     chatId,
//     participants: updatedGroupChat.participants.map(p => p._id),
//     eventType: ChatEventEnum.UPDATE_GROUP_EVENT,
//     data: updatedGroupChat
//   });

//   await sendGroupNotifications(req, {
//     chatId,
//     participants: [participantObjectId],
//     eventType: ChatEventEnum.REMOVED_FROM_GROUP_EVENT,
//     data: {
//       chatId,
//       removedBy: req.user._id,
//       groupName: groupChat.name
//     }
//   });

//   return res
//     .status(200)
//     .json(new ApiResponse(200, updatedGroupChat, "Participant removed successfully"));
// });

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
  const groupChat = await GroupChat.findOne({
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
  const updatedGroupChat = await GroupChat.findByIdAndUpdate(
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

  // Get admin/sender info for notifications
  const adminUser = await User.findById(req.user._id)
    .select("username name avatar")
    .lean();
  const adminName = adminUser.name || adminUser.username;

  // Get removed user info
  const removedUser = await User.findById(participantId)
    .select("username name deviceToken")
    .lean();
  const removedUserName = removedUser.name || removedUser.username;

  // 1. Notification to removed user
  if (removedUser.deviceToken) {
    const removedUserNotification = {
      title: `Removed from ${groupChat.name}`,
      body: `You were removed by ${adminName}`,
      data: {
        chatId: chatId.toString(),
        groupName: groupChat.name,
        type: 'removed_from_group',
        removedBy: req.user._id.toString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      icon: adminUser.avatar || null
    };

    try {
      await sendFirebaseNotification(
        [removedUser.deviceToken],
        removedUserNotification
      );
    } catch (error) {
      console.error('Failed to send removal notification:', error);
    }
  }

  // 2. Notification to remaining group members
  const remainingMembers = await User.find({
    _id: { $in: updatedGroupChat.participants },
    deviceToken: { $exists: true, $ne: null }
  }).select('deviceToken');

  const groupNotification = {
    title: `${groupChat.name} updated`,
    body: `${removedUserName} was removed by ${adminName}`,
    data: {
      chatId: chatId.toString(),
      groupName: groupChat.name,
      type: 'group_updated',
      updatedBy: req.user._id.toString(),
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    },
    icon: adminUser.avatar || null
  };

  const notificationPromises = remainingMembers
    .filter(member => member.deviceToken)
    .map(async (member) => {
      try {
        await sendFirebaseNotification(
          [member.deviceToken],
          groupNotification
        );
      } catch (error) {
        console.error(`Failed to send notification to user ${member._id}:`, error);
      }
    });

  await Promise.all(notificationPromises);

  // Socket notifications
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
        groupName: groupChat.name
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
  const groupChat = await GroupChat.findOne({
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
      GroupChat.findByIdAndDelete(chatId),
      deleteCascadeChatMessages(chatId)
    ]);

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Group deleted as last participant left"));
  }

  // Check if leaving user is the last admin
  const isLastAdmin = groupChat.admins.length === 1 &&
    groupChat.admins[0].equals(req.user._id);

  // Prepare update operations (safely handle missing/unexpected fields)
  const update = {
    $pull: {
      participants: req.user._id,
    },
    $set: { lastActivity: new Date() }
  };

  // Only try to pull from unreadCounts if it exists and is an array
  if (groupChat.unreadCounts && Array.isArray(groupChat.unreadCounts)) {
    update.$pull.unreadCounts = { user: req.user._id };
  }

  // If last admin, promote another participant
  if (isLastAdmin && otherParticipants.length > 0) {
    update.$addToSet = { admins: otherParticipants[0] };
  }

  const updatedGroupChat = await GroupChat.findByIdAndUpdate(
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
  const groupChat = await GroupChat.findOneAndDelete({
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

  await sendGroupNotifications(req, {
    chatId,
    participants: groupChat.participants,
    eventType: ChatEventEnum.GROUP_DELETED_EVENT,
    data: {
      chatId,
      deletedBy: req.user._id,
      groupName: groupChat.name
    }
  })
  return res
    .status(200)
    .json
    (new ApiResponse(200, {}, "Group chat deleted successfully"));
});

/**
 * @route POST /api/v1/chats/group/:chatId/join
 * @description Request to join a group
 */
const requestToJoinGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { message } = req.body;

  // Get group chat and validate
  const groupChat = await GroupChat.findOne({
    _id: chatId,
    isGroupChat: true
  }).select("participants pendingJoinRequests admins settings name").lean();

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found");
  }

  // Check if group allows joining by request
  if (groupChat.settings.joinByLink) {
    throw new ApiError(400, "This group allows joining by link only");
  }

  // Check if already a member
  if (groupChat.participants.some(p => p.equals(req.user._id))) {
    throw new ApiError(400, "You are already a member of this group");
  }

  // Check if already requested
  if (groupChat.pendingJoinRequests.some(pendingReq => pendingReq.user.equals(req.user._id))) {
    throw new ApiError(400, "You have already requested to join this group");
  }

  // Add join request
  const updatedChat = await GroupChat.findByIdAndUpdate(
    chatId,
    {
      $push: {
        pendingJoinRequests: {
          user: req.user._id,
          requestedAt: new Date(),
          message: message?.trim() || ""
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

  // Get admin tokens for Firebase notifications
  const admins = await User.find({ _id: { $in: groupChat.admins } })
    .select("notificationTokens")
    .lean();

  const adminTokens = admins.flatMap(admin => admin.notificationTokens || []);

  // Prepare notification data for admins
  const notificationData = {
    title: "New Join Request",
    body: `${user.username} has requested to join ${groupChat.name}`,
    data: {
      chatId: chatId,
      userId: req.user._id,
      username: user.username,
      type: "JOIN_REQUEST",
      groupName: groupChat.name
    }
  };

  // Send Firebase notifications to admins
  if (adminTokens.length > 0) {
    await sendFirebaseNotification(adminTokens, notificationData)
      .catch(err => console.error("Failed to send Firebase notification:", err));
  }

  // Notify group admins individually via socket
  const adminNotifications = groupChat.admins.map(adminId =>
    emitSocketEvent(
      req,
      adminId.toString(),
      ChatEventEnum.JOIN_REQUEST_EVENT,
      {
        chatId,
        userId: req.user._id,
        username: user.username,
        message: message?.trim() || ""
      }
    )
  );

  await Promise.all(adminNotifications);

  // Send group notifications to admins
  await sendGroupNotifications(req, {
    chatId,
    participants: groupChat.admins,
    eventType: ChatEventEnum.JOIN_REQUEST_EVENT,
    data: {
      chatId,
      userId: req.user._id,
      username: user.username,
      message: message?.trim() || "",
      groupName: groupChat.name
    }
  });

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
  const groupChat = await GroupChat.findOne({
    _id: chatId,
    isGroupChat: true,
    admins: req.user._id,
  }).select("participants pendingJoinRequests admins name").lean();

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

  // Get admin and user info for notifications
  const [admin, user] = await Promise.all([
    User.findById(req.user._id).select("username").lean(),
    User.findById(userId).select("username notificationTokens").lean()
  ]);

  if (approve) {
    // Validate user exists
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Calculate unread count for the new participant
    const unreadCount = await GroupChatMessage.countDocuments({
      chat: chatId,
      sender: { $ne: userId },
    });

    // Add user to participants
    const updatedChat = await GroupChat.findByIdAndUpdate(
      chatId,
      {
        $addToSet: { participants: userId },
        $pull: { pendingJoinRequests: { user: userId } },
        $push: { unreadCounts: { user: userId, count: unreadCount } },
        $set: { lastActivity: new Date() }
      },
      { new: true, lean: true }
    );

    // Get all participant tokens for notifications
    const participants = await User.find({ _id: { $in: groupChat.participants } })
      .select("notificationTokens")
      .lean();
    const participantTokens = participants.flatMap(p => p.notificationTokens || []);

    // Prepare notification data
    const userNotificationData = {
      title: "Join Request Approved",
      body: `Your request to join ${groupChat.name} has been approved`,
      data: {
        chatId: chatId,
        groupName: groupChat.name,
        type: "JOIN_REQUEST_APPROVED"
      }
    };

    const groupNotificationData = {
      title: "New Member",
      body: `${user.username} has joined ${groupChat.name}`,
      data: {
        chatId: chatId,
        userId: userId,
        username: user.username,
        type: "NEW_MEMBER",
        groupName: groupChat.name
      }
    };

    // Send Firebase notifications
    await Promise.all([
      // Notify the user who was approved
      user.notificationTokens?.length > 0
        ? sendFirebaseNotification(user.notificationTokens, userNotificationData)
          .catch(err => console.error("Failed to send user approval notification:", err))
        : Promise.resolve(),

      // Notify group participants about new member
      participantTokens.length > 0
        ? sendFirebaseNotification(participantTokens, groupNotificationData)
          .catch(err => console.error("Failed to send group notification:", err))
        : Promise.resolve()
    ]);

    // Notify all parties via socket
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
    const updatedChat = await GroupChat.findByIdAndUpdate(
      chatId,
      {
        $pull: { pendingJoinRequests: { user: userId } },
        $set: { lastActivity: new Date() }
      },
      { new: true, lean: true }
    );

    // Prepare rejection notification
    const rejectionNotificationData = {
      title: "Join Request Rejected",
      body: `Your request to join ${groupChat.name} has been rejected`,
      data: {
        chatId: chatId,
        groupName: groupChat.name,
        type: "JOIN_REQUEST_REJECTED"
      }
    };

    // Send Firebase notification to rejected user
    if (user?.notificationTokens?.length > 0) {
      await sendFirebaseNotification(user.notificationTokens, rejectionNotificationData)
        .catch(err => console.error("Failed to send rejection notification:", err));
    }

    // Notify the rejected user via socket
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
  const groupChat = await GroupChat.findOne({
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

  // Format response
  const pendingRequests = groupChat.pendingJoinRequests.map((request) => ({
    userId: request.user._id,
    username: request.user.username,
    email: request.user.email,
    avatar: request.user.avatar,
    requestedAt: request.requestedAt,
    message: request.message || ""
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, pendingRequests, "Pending join requests fetched successfully"));
});


/**
 * @route POST /api/v1/chats/group/:chatId/generate-link
 * @description Generate or regenerate an invite link for a group
 */
const generateGroupInviteLink = asyncHandler(async (req, res) => {
  try {
    const { chatId } = req.params;
    const { expiresIn } = req.body;

    // Debug: Check if user is authenticated
    console.log("User:", req.user);
    if (!req.user?._id) {
      throw new ApiError(401, "Unauthorized: User not logged in");
    }

    // Validate expiresIn
    if (expiresIn && isNaN(expiresIn)) {
      throw new ApiError(400, "expiresIn must be a number (hours)");
    }

    // Get group chat and validate admin status
    const groupChat = await GroupChat.findOne({
      _id: chatId,
      isGroupChat: true,
      admins: req.user._id, // Ensure 'admins' is the correct field name
    });

    if (!groupChat) {
      throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    // Initialize settings if not present
    if (!groupChat.settings) {
      groupChat.settings = {};
    }

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 60 * 60 * 1000)
      : null;

    // Update group settings
    groupChat.settings.joinByLink = true;
    groupChat.settings.inviteLinkToken = token;
    if (expiresAt) groupChat.settings.inviteLinkExpiresAt = expiresAt;

    await groupChat.save();

    // Construct join link
    const joinLink = `${req.protocol}://${req.get("host")}/api/v1/join/${token}`;

    return res.status(200).json(
      new ApiResponse(
        200,
        { joinLink, expiresAt },
        "Group invite link generated successfully"
      )
    );
  } catch (error) {
    console.error("Error in generateGroupInviteLink:", error); // Log full error
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, error.message || "Failed to generate invite link");
  }
});
/**
 * @route POST /api/v1/chats/group/join/:token
 * @description Join a group using an invite link
 */
const joinGroupViaLink = asyncHandler(async (req, res) => {
  const { token } = req.params;

  // Find group by token
  const groupChat = await GroupChat.findOne({
    'settings.inviteLinkToken': token,
    isGroupChat: true
  });

  if (!groupChat) {
    throw new ApiError(404, "Invalid or expired invite link");
  }

  // Check if link has expired
  if (groupChat.settings.inviteLinkExpiresAt &&
    new Date() > groupChat.settings.inviteLinkExpiresAt) {
    throw new ApiError(400, "This invite link has expired");
  }

  // Check if user is already a participant
  if (groupChat.participants.some(p => p.equals(req.user._id))) {
    throw new ApiError(400, "You are already a member of this group");
  }

  // Calculate unread count for the new participant
  const unreadCount = await GroupChatMessage.countDocuments({
    chat: groupChat._id,
    sender: { $ne: req.user._id }
  });

  // Add user to participants
  groupChat.participants.push(req.user._id);
  groupChat.unreadCounts.push({ user: req.user._id, count: unreadCount });
  await groupChat.save();

  // Get populated group chat for response
  const [updatedGroupChat] = await GroupChat.aggregate([
    { $match: { _id: groupChat._id } },
    ...chatCommonAggregation(req.user._id),
  ]);

  // Notify group participants
  const notificationEvents = updatedGroupChat.participants
    .filter(p => !p._id.equals(req.user._id))
    .map(participant =>
      emitSocketEvent(
        req,
        participant._id.toString(),
        ChatEventEnum.UPDATE_GROUP_EVENT,
        updatedGroupChat
      )
    );

  await Promise.all(notificationEvents);

  return res.status(200).json(
    new ApiResponse(
      200,
      updatedGroupChat,
      "Successfully joined the group"
    )
  );
});

/**
 * @route DELETE /api/v1/chats/group/:chatId/revoke-link
 * @description Revoke the current invite link
 */
const revokeGroupInviteLink = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  // Get group chat and validate admin status
  const groupChat = await GroupChat.findOneAndUpdate(
    {
      _id: chatId,
      isGroupChat: true,
      admins: req.user._id
    },
    {
      $set: {
        'settings.joinByLink': false,
        'settings.inviteLinkToken': null,
        'settings.inviteLinkExpiresAt': null
      }
    },
    { new: true }
  );

  if (!groupChat) {
    throw new ApiError(404, "Group chat not found or you're not an admin");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {},
      "Group invite link revoked successfully"
    )
  );
});








// Utility function for sending notifications

const sendGroupNotifications = async (req, {
  chatId,
  participants,
  excludedUsers = [],
  eventType,
  data,
  includePushNotifications = true
}) => {
  try {
    // Get necessary user data
    const usersToNotify = await User.find({
      _id: { $in: participants },
      _id: { $nin: excludedUsers }
    }).select('_id deviceToken');

    // Socket notifications
    const socketNotifications = usersToNotify.map(user => {
      try {
        return emitSocketEvent(
          req,
          user._id.toString(),
          eventType,
          data
        );
      } catch (error) {
        console.error(`Socket notification failed for user ${user._id}`, error);
        return null;
      }
    });

    // Push notifications
    let pushNotifications = [];
    if (includePushNotifications && admin?.messaging) {
      pushNotifications = usersToNotify
        .filter(user => user.deviceToken)
        .map(async user => {
          try {
            const message = {
              notification: {
                title: 'Group Update',
                body: getNotificationBody(eventType, data),
              },
              token: user.deviceToken,
              data: {
                chatId: chatId.toString(),
                type: eventType,
                ...data
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
    console.error('Error in sendGroupNotifications:', error);
  }
};

// Helper function for notification content
const getNotificationBody = (eventType, data) => {
  switch (eventType) {
    case ChatEventEnum.UPDATE_GROUP_EVENT:
      return 'Group details were updated';
    case ChatEventEnum.NEW_GROUP_CHAT_EVENT:
      return `You were added to group "${data.name}"`;
    case ChatEventEnum.REMOVED_FROM_GROUP_EVENT:
      return 'You were removed from a group';
    case ChatEventEnum.LEFT_GROUP_EVENT:
      return 'You left the group';
    case ChatEventEnum.GROUP_DELETED_EVENT:
      return 'A group was deleted';
    case ChatEventEnum.JOIN_REQUEST_EVENT:
      return `New join request from ${data.username}`;
    default:
      return 'Group notification';
  }
};

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
  sendGroupMessage,
  generateGroupInviteLink,
  joinGroupViaLink,
  revokeGroupInviteLink,
  getAllGroups,
  updateUnreadCounts

};