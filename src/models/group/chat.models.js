import mongoose, { Schema } from "mongoose";

const chatSchema = new Schema(
  {
    name: {
      type: String,
      required: function () {
        return this.isGroupChat;
      },
      trim: true,
      maxlength: [100, "Group name cannot be more than 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot be more than 500 characters"],
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
        required: true,
      },
    ],
    admins: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
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
      type: {
        url: String,
        localPath: String,
      },
      default: null,
    },
    unreadCounts: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true
        },
        count: {
          type: Number,
          default: 0
        }
      }
    ],
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
        message: {
          type: String,
          trim: true,
          maxlength: 200,
        },
      },
    ],
    settings: {

      singleUseLinks: {
        type: Boolean,
        default: false
      },
      usedTokens: [{
        token: String,
        usedAt: Date,
        usedBy: { type: Schema.Types.ObjectId, ref: "User" }
      }],

      joinByLink: {
        type: Boolean,
        default: false,
      },
      inviteLinkToken: {
        type: String,
        unique: true,
        sparse: true,
      },
      sendMediaPermission: {
        type: String,
        enum: ["all", "admins", "none"],
        default: "all",
      },
      sendMessagesPermission: {
        type: String,
        enum: ["all", "admins", "none"],
        default: "all",
      },
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Indexes for better performance
chatSchema.index({ isGroupChat: 1 });
chatSchema.index({ participants: 1 });
chatSchema.index({ lastMessage: 1 });
chatSchema.index({ updatedAt: -1 });
chatSchema.index({ "pendingJoinRequests.user": 1 });
chatSchema.index({ "settings.inviteLinkToken": 1 }, { unique: true, sparse: true });

// Pre-save hook to generate invite link token
chatSchema.pre("save", function (next) {
  if (this.isGroupChat && this.settings.joinByLink && !this.settings.inviteLinkToken) {
    this.settings.inviteLinkToken = require("crypto").randomBytes(32).toString("hex");
  }
  next();
});

export const GroupChat = mongoose.model("GroupChat", chatSchema);