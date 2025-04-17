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
 * @param {Socket<import("socket.io/dist/typed-events").DefaultEventsMap, import("socket.io/dist/typed-events").DefaultEventsMap, import("socket.io/dist/typed-events").DefaultEventsMap, any>} socket
 */
const mountJoinChatEvent = (socket) => {
  socket.on(ChatEventEnum.JOIN_CHAT_EVENT, (chatId) => {
    console.log(`User joined the chat 🤝. chatId: `, chatId);
    // joining the room with the chatId will allow specific events to be fired where we don't bother about the users like typing events
    // E.g. When user types we don't want to emit that event to specific participant.
    // We want to just emit that to the chat where the typing is happening
    socket.join(chatId);
  });
};

/**
 * @description This function is responsible to emit the typing event to the other participants of the chat
 * @param {Socket<import("socket.io/dist/typed-events").DefaultEventsMap, import("socket.io/dist/typed-events").DefaultEventsMap, import("socket.io/dist/typed-events").DefaultEventsMap, any>} socket
 */
const mountParticipantTypingEvent = (socket) => {
  socket.on(ChatEventEnum.TYPING_EVENT, (chatId) => {
    socket.in(chatId).emit(ChatEventEnum.TYPING_EVENT, chatId);
  });
};

/**
 * @description This function is responsible to emit the stopped typing event to the other participants of the chat
 * @param {Socket<import("socket.io/dist/typed-events").DefaultEventsMap, import("socket.io/dist/typed-events").DefaultEventsMap, import("socket.io/dist/typed-events").DefaultEventsMap, any>} socket
 */
const mountParticipantStoppedTypingEvent = (socket) => {
  socket.on(ChatEventEnum.STOP_TYPING_EVENT, (chatId) => {
    socket.in(chatId).emit(ChatEventEnum.STOP_TYPING_EVENT, chatId);
  });
};

/**
 * @description This function is responsible to update the user status when user is online or offline
 *  @param {string} userId - User id of the user whose status is being updated
 * @param {boolean} isOnline - User status (online or offline)  
 * */
const updateUserStatus = async (userId, isOnline) => {
  try {
    await User.findByIdAndUpdate(userId, { isOnline, lastSeen: isOnline ? null : new Date() });
  } catch (error) {
    console.error(`Failed to update user status for ${userId}:`, error);
  }
};

/**
 *
 * @param {Server<import("socket.io/dist/typed-events").DefaultEventsMap, import("socket.io/dist/typed-events").DefaultEventsMap, import("socket.io/dist/typed-events").DefaultEventsMap, any>} io
 */
const initializeSocketIO =  (io) => {

  // Middleware to handle authentication and authorization

  const groupChatNamespace = io.of("/group-chats");

  groupChatNamespace.use(async (socket, next) => {
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
      const user = User.findById(decodedToken?._id).select("-password -refreshToken");
      if (!user) {
        throw new ApiError(401, "Unauthorized handshake. User not found");
      }

      socket.user = user;
      next();
    } catch (error) {
      next(error);
    }
  });

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
            .emit(ChatEventEnum.LAST_SEEN_EVENT, { userId: socket.user._id, lastSeen: new Date() });
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

  return groupChatNamespace;




};


// return io.on("connection", async (socket) => {
//   try {
//     // parse the cookies from the handshake headers (This is only possible if client has `withCredentials: true`)
//     const cookies = cookie.parse(socket.handshake.headers?.cookie || "");

//     let token = cookies?.accessToken; // get the accessToken

//     if (!token) {
//       // If there is no access token in cookies. Check inside the handshake auth
//       token = socket.handshake.auth?.token;
//     }

//     if (!token) {
//       // Token is required for the socket to work
//       throw new ApiError(401, "Un-authorized handshake. Token is missing");
//     }

//     const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET); // decode the token

//     const user = await User.findById(decodedToken?._id).select(
//       "-password -refreshToken"
//     );

//     // retrieve the user
//     if (!user) {
//       throw new ApiError(401, "Un-authorized handshake. Token is invalid");
//     }
//     socket.user = user; // mount te user object to the socket

//     // We are creating a room with user id so that if user is joined but does not have any active chat going on.
//     // still we want to emit some socket events to the user.
//     // so that the client can catch the event and show the notifications.
//     socket.join(user._id.toString());
//     socket.emit(ChatEventEnum.CONNECTED_EVENT); // emit the connected event so that client is aware
//     console.log("User connected 🗼. userId: ", user._id.toString());

//     // Common events that needs to be mounted on the initialization
//     mountJoinChatEvent(socket);
//     mountParticipantTypingEvent(socket);
//     mountParticipantStoppedTypingEvent(socket);

//     socket.on(ChatEventEnum.DISCONNECT_EVENT, () => {
//       console.log("user has disconnected 🚫. userId: " + socket.user?._id);
//       if (socket.user?._id) {
//         socket.leave(socket.user._id);
//       }
//     });



//   } catch (error) {
//     socket.emit(
//       ChatEventEnum.SOCKET_ERROR_EVENT,
//       error?.message || "Something went wrong while connecting to the socket."
//     );
//   }
// });

/**
 *
 * @param {import("express").Request} req - Request object to access the `io` instance set at the entry point
 * @param {string} roomId - Room where the event should be emitted
 * @param {AvailableChatEvents[0]} event - Event that should be emitted
 * @param {any} payload - Data that should be sent when emitting the event
 * @description Utility function responsible to abstract the logic of socket emission via the io instance
 */
const emitSocketEvent = (req, roomId, event, payload) => {
  try {
    const io = req.app.get("io").of("/group-chats");
    io.in(roomId).emit(event, payload);
    console.log(`Emitted event ${event} to room ${roomId}`);
  } catch (error) {
    console.error(`Failed to emit event ${event} to room ${roomId}:`, error);
    throw new ApiError(500, `Failed to emit socket event: ${error.message}`);
  }
};



export { initializeSocketIO, emitSocketEvent };



