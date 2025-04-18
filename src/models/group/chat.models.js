import mongoose, { Schema } from "mongoose";

const chatSchema = new Schema(
  {
    name: {
      type: String,
      required: function () {
        return this.isGroupChat;
      },
    },
    isGroupChat: {
      type: Boolean,
      default: false,
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "ChatMessage",
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    admins: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.isGroupChat;
      },
    },
    avatar: {
      type: String,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    pendingJoinRequests: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        requestedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

// Indexes for better performance
chatSchema.index({ isGroupChat: 1 });
chatSchema.index({ participants: 1 });
chatSchema.index({ lastMessage: 1 });
chatSchema.index({ updatedAt: -1 });
chatSchema.index({ pendingJoinRequests: 1 }); // Index for join requests
chatSchema.index({ "pendingJoinRequests.user": 1 }); // Index for user-specific join requests

export const Chat = mongoose.model("GroupChat", chatSchema);