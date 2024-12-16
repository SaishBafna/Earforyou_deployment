import mongoose from "mongoose";
import { ChatEventEnum } from "../../../src/constants.js";
import User from "../../models/Users.js";
import { Chat } from "../../models/chat.modal.js";
import { ChatMessage } from "../../models/message.models.js";
import { emitSocketEvent } from "../../socket/index.js";
import { ApiError } from "../../../src/utils/ApiError.js";
import { ApiResponse } from "../../../src/utils/ApiResponse.js";
import { asyncHandler } from "../../../src/utils/asyncHandler.js";
import { removeLocalFile } from "../../../src/utils/helpers.js";


/**
 * @description Marks a message as read and updates the seen status
 * @route POST /api/v1/messages/:messageId/read
 */

const markMessageAsRead = asyncHandler(async (req, res) => {
  const { messageId } = req.params;

  // Find the message by ID
  const message = await ChatMessage.findById(messageId);

  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  // Check if the user has already read the message
  if (message.seenBy && message.seenBy.includes(req.user._id)) {
    return res.status(200).json(new ApiResponse(200, {}, "Message already marked as read"));
  }

  // Update the message's seenBy and isRead fields with the current user's ID
  message.seenBy = message.seenBy || [];
  message.seenBy.push(req.user._id); // Add the current user to the seenBy array
  message.isRead = true;

  await message.save();

  // Update the unreadMessages field in the associated chat
  const chat = await Chat.findById(message.chat);

  if (!chat) {
    throw new ApiError(404, "Chat not found");
  }

  // Decrease the unread count for the current user in the unreadMessages map
  const userId = req.user._id.toString();
  chat.unreadMessages[userId] = Math.max((chat.unreadMessages[userId] || 1) - 1, 0);

  await chat.save();

  // Emit a MESSAGE_READ_EVENT for real-time notification
  emitSocketEvent(
    req,
    message.chat.toString(), // Target chat room or specific identifier
    ChatEventEnum.MESSAGE_READ_EVENT, // Event type
    {
      messageId,
      seenBy: message.seenBy, // Include the updated seenBy list
      unreadMessages: chat.unreadMessages, // Include the updated unreadMessages map
    }
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { messageId, seenBy: message.seenBy, unreadMessages: chat.unreadMessages },
        "Message marked as read successfully"
      )
    );
});


/**
 * @description Utility function which returns the pipeline stages to structure the chat schema with common lookups
 * @returns {mongoose.PipelineStage[]}
 */

const chatCommonAggregation = () => {
  return [
    {
      // lookup for the participants present
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "participants",
        as: "participants",
        pipeline: [
          {
            $project: {
              password: 0,
              refreshToken: 0,
              forgotPasswordToken: 0,
              forgotPasswordExpiry: 0,
              emailVerificationToken: 0,
              emailVerificationExpiry: 0,
            },
          },
        ],
      },
    },
    {
      // lookup for the group chats
      $lookup: {
        from: "chatmessages",
        foreignField: "_id",
        localField: "lastMessage",
        as: "lastMessage",
        pipeline: [
          {
            // get details of the sender
            $lookup: {
              from: "users",
              foreignField: "_id",
              localField: "sender",
              as: "sender",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    avatar: 1,
                    email: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              sender: { $first: "$sender" },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        lastMessage: { $first: "$lastMessage" },
      },
    },
  ];
};

/**
 *
 * @param {string} chatId
 * @description utility function responsible for removing all the messages and file attachments attached to the deleted chat
 */
const deleteCascadeChatMessages = async (chatId) => {
  // fetch the messages associated with the chat to remove
  const messages = await ChatMessage.find({
    chat: new mongoose.Types.ObjectId(chatId),
  });

  let attachments = [];

  // get the attachments present in the messages
  attachments = attachments.concat(
    ...messages.map((message) => {
      return message.attachments;
    })
  );

  attachments.forEach((attachment) => {
    // remove attachment files from the local storage
    removeLocalFile(attachment.localPath);
  });

  // delete all the messages
  await ChatMessage.deleteMany({
    chat: new mongoose.Types.ObjectId(chatId),
  });
};



const searchAvailableUsers = asyncHandler(async (req, res) => {
  const users = await User.aggregate([
    {
      $match: {
        _id: {
          $ne: req.user._id, // avoid logged in user
        },
      },
    },
    {
      $project: {
        avatar: 1,
        username: 1,
        email: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, users, "Users fetched successfully"));
});

const createOrGetAOneOnOneChat = asyncHandler(async (req, res) => {
  const { receiverId } = req.params;

  // Step 1: Validate the receiver
  const receiver = await User.findById(receiverId);

  if (!receiver) {
    throw new ApiError(404, "Receiver does not exist");
  }

  // Check if the receiver is not the logged-in user
  if (receiver._id.toString() === req.user._id.toString()) {
    throw new ApiError(400, "You cannot chat with yourself");
  }

  // Step 2: Check if a one-on-one chat already exists
  const existingChat = await Chat.findOne({
    isGroupChat: false,
    participants: { $all: [req.user._id, receiver._id] },
  });

  if (existingChat) {
    // Reset unread messages count for the logged-in user
    await Chat.updateOne(
      { _id: existingChat._id },
      {
        $set: {
          [`unreadMessages.${req.user._id}`]: 0,
        },
      }
    );

    // Return the chat with updated unread message counts
    const updatedChat = await Chat.aggregate([
      {
        $match: { _id: existingChat._id },
      },
      ...chatCommonAggregation(),
    ]);

    return res
      .status(200)
      .json(
        new ApiResponse(200, updatedChat[0], "Chat retrieved successfully")
      );
  }

  // Step 3: Aggregate to check for existing chats in a structured format
  const chat = await Chat.aggregate([
    {
      $match: {
        isGroupChat: false, // Ensure this is not a group chat
        $and: [
          { participants: { $elemMatch: { $eq: req.user._id } } },
          { participants: { $elemMatch: { $eq: new mongoose.Types.ObjectId(receiverId) } } },
        ],
      },
    },
    ...chatCommonAggregation(),
  ]);

  if (chat.length) {
    // Reset unread messages count for the logged-in user
    await Chat.updateOne(
      { _id: chat[0]._id },
      {
        $set: {
          [`unreadMessages.${req.user._id}`]: 0,
        },
      }
    );

    return res
      .status(200)
      .json(new ApiResponse(200, chat[0], "Chat retrieved successfully"));
  }

  // Step 4: Create a new one-on-one chat if it doesn't exist
  const newChatInstance = await Chat.create({
    name: "One on one chat",
    participants: [req.user._id, receiver._id], // Add participants
    admin: req.user._id, // Assign the admin
    unreadMessages: {
      [req.user._id]: 0,
      [receiver._id]: 0, // Initialize unread message counts
    },
  });

  // Fetch the created chat with aggregation for consistency
  const createdChat = await Chat.aggregate([
    {
      $match: { _id: newChatInstance._id },
    },
    ...chatCommonAggregation(),
  ]);

  const payload = createdChat[0];

  if (!payload) {
    throw new ApiError(500, "Failed to create the chat");
  }

  // Step 5: Emit a new chat event to the other participant
  payload?.participants?.forEach((participant) => {
    if (participant._id.toString() === req.user._id.toString()) return;

    emitSocketEvent(
      req,
      participant._id.toString(),
      ChatEventEnum.NEW_CHAT_EVENT,
      payload
    );
  });

  // Step 6: Return the newly created chat
  return res
    .status(201)
    .json(new ApiResponse(201, payload, "New chat created successfully"));
});




const deleteOneOnOneChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  // check for chat existence
  const chat = await Chat.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(chatId),
      },
    },
    ...chatCommonAggregation(),
  ]);

  const payload = chat[0];

  if (!payload) {
    throw new ApiError(404, "Chat does not exist");
  }

  await Chat.findByIdAndDelete(chatId); // delete the chat even if user is not admin because it's a personal chat

  await deleteCascadeChatMessages(chatId); // delete all the messages and attachments associated with the chat

  const otherParticipant = payload?.participants?.find(
    (participant) => participant?._id.toString() !== req.user._id.toString() // get the other participant in chat for socket
  );

  // emit event to other participant with left chat as a payload
  emitSocketEvent(
    req,
    otherParticipant._id?.toString(),
    ChatEventEnum.LEAVE_CHAT_EVENT,
    payload
  );

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Chat deleted successfully"));
});



// const getAllChats = asyncHandler(async (req, res) => {
//   const chats = await Chat.aggregate([
//     {
//       $match: {
//         participants: { $elemMatch: { $eq: req.user._id } }, // get all chats that have logged in user as a participant
//       },
//     },
//     {
//       $sort: {
//         updatedAt: -1,
//       },
//     },
//     ...chatCommonAggregation(),
//   ]);

//   return res
//     .status(200)
//     .json(
//       new ApiResponse(200, chats || [], "User chats fetched successfully!")
//     );
// });
const getAllChats = asyncHandler(async (req, res) => {
  const chats = await Chat.aggregate([
    {
      $match: {
        participants: { $elemMatch: { $eq: req.user._id } }, // Match chats with the logged-in user as a participant
      },
    },
    {
      $lookup: {
        from: "messages", // Assuming messages are stored in a separate collection
        localField: "_id", // Chat ID
        foreignField: "chatId", // Corresponding chat ID in the messages collection
        as: "messages",
        pipeline: [
          { $sort: { createdAt: -1 } }, // Sort messages by creation time in descending order
          { $limit: 1 }, // Fetch only the most recent message
        ],
      },
    },
    {
      $addFields: {
        lastMessage: { $arrayElemAt: ["$messages", 0] }, // Extract the most recent message
      },
    },
    {
      $project: {
        messages: 0, // Exclude the `messages` field as it's no longer needed
      },
    },
    {
      $sort: {
        updatedAt: -1, // Sort chats by update time
      },
    },
    ...chatCommonAggregation(), // Include your common aggregation steps if necessary
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, chats || [], "User chats fetched successfully!")
    );
});


export {
  createOrGetAOneOnOneChat,
  deleteOneOnOneChat,
  getAllChats,
  searchAvailableUsers,
  markMessageAsRead
};
