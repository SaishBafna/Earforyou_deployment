import mongoose, { Schema } from "mongoose";

const chatMessageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: [5000, "Message content cannot be more than 5000 characters"],
    },
    attachments: {
      type: [
        {
          url: String,
          localPath: String,
          fileType: {
            type: String,
            enum: ["image", "video", "audio", "document", "other"],
            default: "other",
          },
          fileName: String,
          size: Number,
          thumbnailUrl: String,
          duration: Number,
          dimensions: {
            width: Number,
            height: Number,
          },
        },
      ],
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= 10;
        },
        message: "Cannot attach more than 10 files",
      },
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: "GroupChat",
      required: true,
    },
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    seenBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    edited: {
      type: Boolean,
      default: false,
    },
    replyTo: {
      type: new Schema(
        {
          messageId: {
            type: Schema.Types.ObjectId,
            ref: "GroupChatMessage",
            required: true,
          },
          sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          content: {
            type: String,
            trim: true,
          },
          attachments: {
            type: [
              {
                url: String,
                fileType: String,
                thumbnailUrl: String,
              },
            ],
            default: [],
          },
          isDeleted: {
            type: Boolean,
            default: false,
          },
          deletedContentPlaceholder: {
            type: String,
            default: "This message was deleted",
          },
          originalCreatedAt: {
            type: Date,
            required: true,
          },
        },
        { _id: false }
      ),
      default: null,
    },
    reactions: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        emoji: {
          type: String,
          required: true,
          maxlength: 5,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Indexes for optimized queries
chatMessageSchema.index({ chat: 1, createdAt: -1 });
chatMessageSchema.index({ sender: 1 });
chatMessageSchema.index({ chat: 1, isRead: 1, sender: 1 });
chatMessageSchema.index({ chat: 1, deletedFor: 1 });
chatMessageSchema.index({ chat: 1, replyTo: 1 });
chatMessageSchema.index({ chat: 1, reactions: 1 });
chatMessageSchema.index({ "reactions.user": 1 });
chatMessageSchema.index({ createdAt: -1 });

// Pre-save hook to validate attachments
chatMessageSchema.pre("save", function (next) {
  if (!this.content && (!this.attachments || this.attachments.length === 0)) {
    throw new Error("Message must have either content or attachments");
  }
  next();
});

export const GroupChatMessage = mongoose.model("GroupChatMessage", chatMessageSchema);