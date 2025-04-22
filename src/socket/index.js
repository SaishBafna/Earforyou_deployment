import cookie from "cookie";
import jwt from "jsonwebtoken";
import { Server, Socket } from "socket.io";
import { AvailableChatEvents, ChatEventEnum } from "../constants.js";
import User from "../models/Users.js";
import { ApiError } from "../utils/ApiError.js";

// Rate limiter for connection attempts
const connectionAttempts = new Map();
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW = 60 * 1000; // 1 minute

/**
 * @description This function is responsible to allow user to join the chat represented by chatId (chatId). event happens when user switches between the chats
 * @param {Socket} socket
 */
const mountJoinChatEvent = (socket) => {
  socket.on(ChatEventEnum.JOIN_CHAT_EVENT, (chatId) => {
    console.log(`User joined the chat 🤝. chatId: `, chatId);
    socket.join(chatId);
  });
};

/**
 * @description This function is responsible to emit the typing event to the other participants of the chat
 * @param {Socket} socket
 */
const mountParticipantTypingEvent = (socket) => {
  socket.on(ChatEventEnum.TYPING_EVENT, (chatId) => {
    socket.in(chatId).emit(ChatEventEnum.TYPING_EVENT, chatId);
  });
};

/**
 * @description This function is responsible to emit the stopped typing event to the other participants of the chat
 * @param {Socket} socket
 */
const mountParticipantStoppedTypingEvent = (socket) => {
  socket.on(ChatEventEnum.STOP_TYPING_EVENT, (chatId) => {
    socket.in(chatId).emit(ChatEventEnum.STOP_TYPING_EVENT, chatId);
  });
};

/**
 * @description This function is responsible to update the user status when user is online or offline
 * @param {string} userId - User id of the user whose status is being updated
 * @param {boolean} isOnline - User status (online or offline)  
 */
const updateUserStatus = async (userId, isOnline) => {
  try {
    await User.findByIdAndUpdate(userId, { 
      isOnline, 
      lastSeen: isOnline ? null : new Date() 
    });
  } catch (error) {
    console.error(`Failed to update user status for ${userId}:`, error);
  }
};

/**
 * @description Middleware to authenticate socket connection
 * @param {Socket} socket 
 * @param {Function} next 
 */
const socketAuthMiddleware = async (socket, next) => {
  try {
    const clientIp = socket.handshake.address;
    const now = Date.now();

    // Rate limiting logic
    const attempts = connectionAttempts.get(clientIp) || { count: 0, lastAttempt: now };
    if (now - attempts.lastAttempt > ATTEMPT_WINDOW) {
      attempts.count = 0;
      attempts.lastAttempt = now;
    }

    if (attempts.count >= MAX_ATTEMPTS) {
      return next(new ApiError(429, "Too many connection attempts. Please try again later."));
    }

    attempts.count += 1;
    connectionAttempts.set(clientIp, attempts);

    // Parse cookies or auth token
    const cookies = cookie.parse(socket.handshake.headers?.cookie || "");
    let token = cookies?.accessToken || socket.handshake.auth?.token;

    if (!token) {
      throw new ApiError(401, "Unauthorized handshake. Token is missing");
    }

    // Verify token
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
      // Attempt to use refresh token if access token is expired
      const refreshToken = cookies?.refreshToken || socket.handshake.auth?.refreshToken;
      if (!refreshToken) {
        throw new ApiError(401, "Unauthorized handshake. Token is invalid or expired");
      }

      const decodedRefresh = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      const user = await User.findById(decodedRefresh?._id);
      if (!user) {
        throw new ApiError(401, "Unauthorized handshake. Invalid refresh token");
      }

      // Generate new access token
      token = jwt.sign({ _id: user._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
      socket.emit("newAccessToken", token);
      decodedToken = { _id: user._id };
    }

    // Retrieve user
    const user = await User.findById(decodedToken?._id).select("-password -refreshToken");
    if (!user) {
      throw new ApiError(401, "Unauthorized handshake. User not found");
    }

    socket.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * @description Initialize socket.io with namespaces for one-to-one and group chats
 * @param {Server} io 
 */
const initializeSocketIO = (io) => {
  // One-to-One Chat Namespace
  const oneOnOneNamespace = io.of("/one-on-one");
  oneOnOneNamespace.use(socketAuthMiddleware);

  oneOnOneNamespace.on("connection", async (socket) => {
    try {
      // Join user-specific room
      socket.join(socket.user._id.toString());
      socket.emit(ChatEventEnum.CONNECTED_EVENT);
      console.log("User connected 🗼. userId: ", socket.user._id.toString());

      // Update user status to online
      await updateUserStatus(socket.user._id, true);

      // Mount common events
      mountJoinChatEvent(socket);
      mountParticipantTypingEvent(socket);
      mountParticipantStoppedTypingEvent(socket);

      // Handle disconnection
      socket.on(ChatEventEnum.DISCONNECT_EVENT, async () => {
        console.log("User disconnected 🚫. userId: ", socket.user?._id);
        if (socket.user?._id) {
          socket.leave(socket.user._id);
          await updateUserStatus(socket.user._id, false);
          socket.broadcast
            .to(socket.user._id.toString())
            .emit(ChatEventEnum.LAST_SEEN_EVENT, { 
              userId: socket.user._id, 
              lastSeen: new Date() 
            });
        }
      });

      // Handle socket timeout
      socket.on("timeout", () => {
        socket.emit(ChatEventEnum.SOCKET_ERROR_EVENT, "Connection timed out. Please reconnect.");
        socket.disconnect(true);
      });

    } catch (error) {
      socket.emit(
        ChatEventEnum.SOCKET_ERROR_EVENT,
        error?.message || "Something went wrong while connecting to the socket."
      );
      socket.disconnect(true);
    }
  });

  // Group Chat Namespace
  const groupChatNamespace = io.of("/group-chats");
  groupChatNamespace.use(socketAuthMiddleware);

  groupChatNamespace.on("connection", async (socket) => {
    try {
      // Join user-specific room
      socket.join(socket.user._id.toString());
      socket.emit(ChatEventEnum.CONNECTED_EVENT);
      console.log("User connected 🗼. userId: ", socket.user._id.toString());

      // Update user status to online
      await updateUserStatus(socket.user._id, true);

      // Mount common events
      mountJoinChatEvent(socket);
      mountParticipantTypingEvent(socket);
      mountParticipantStoppedTypingEvent(socket);

      // Handle disconnection
      socket.on(ChatEventEnum.DISCONNECT_EVENT, async () => {
        console.log("User disconnected 🚫. userId: ", socket.user?._id);
        if (socket.user?._id) {
          socket.leave(socket.user._id);
          await updateUserStatus(socket.user._id, false);
          socket.broadcast
            .to(socket.user._id.toString())
            .emit(ChatEventEnum.LAST_SEEN_EVENT, { 
              userId: socket.user._id, 
              lastSeen: new Date() 
            });
        }
      });

      // Handle socket timeout
      socket.on("timeout", () => {
        socket.emit(ChatEventEnum.SOCKET_ERROR_EVENT, "Connection timed out. Please reconnect.");
        socket.disconnect(true);
      });

    } catch (error) {
      socket.emit(
        ChatEventEnum.SOCKET_ERROR_EVENT,
        error?.message || "Something went wrong while connecting to the socket."
      );
      socket.disconnect(true);
    }
  });

  return { oneOnOneNamespace, groupChatNamespace };
};

/**
 * @description Utility function to emit socket events
 * @param {import("express").Request} req - Request object to access the `io` instance 
 * @param {string} roomId - Room where the event should be emitted
 * @param {AvailableChatEvents[0]} event - Event that should be emitted
 * @param {any} payload - Data that should be sent when emitting the event
 */
const emitSocketEvent = (req, roomId, event, payload) => {
  try {
    let namespace;
    
    // Determine which namespace to use based on event type
    if ([
      ChatEventEnum.NEW_GROUP_CHAT_EVENT,
      ChatEventEnum.UPDATE_GROUP_EVENT,
      ChatEventEnum.REMOVED_FROM_GROUP_EVENT,
      ChatEventEnum.LEFT_GROUP_EVENT,
      ChatEventEnum.GROUP_DELETED_EVENT,
      ChatEventEnum.JOIN_REQUEST_APPROVED_EVENT,
      ChatEventEnum.JOIN_REQUEST_REJECTED_EVENT
    ].includes(event)) {
      namespace = req.app.get("io").of("/group-chats");
    } else {
      namespace = req.app.get("io").of("/one-on-one");
    }

    if (!namespace) {
      throw new Error("Socket namespace not initialized");
    }

    namespace.in(roomId).emit(event, payload);
    console.log(`Emitted event ${event} to room ${roomId}`);
  } catch (error) {
    console.error(`Failed to emit event ${event} to room ${roomId}:`, error);
    throw new ApiError(500, `Failed to emit socket event: ${error.message}`);
  }
};

export { initializeSocketIO, emitSocketEvent };