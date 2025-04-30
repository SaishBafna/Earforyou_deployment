import mongoose, { Schema } from "mongoose";

const chatSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
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
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    unreadMessages: {
      type: Map,
      of: Number, // Count of unread messages per user
      default: {},
    },

    // isPaidChat: {
    //   type: Boolean,
    //   default: false
    // },
    // chatType: {
    //   type: String,
    //   enum: ['private', 'group'],
    //   required: true,
    //   default: 'private'
    // },
    // initiatedBy: {
    //   type: Schema.Types.ObjectId,
    //   ref: "User"

    // },
    // chargeApplied: {
    //   type: Boolean,
    //   default: false
    // }

  },
  { timestamps: true }
);

export const Chat = mongoose.model("Chat", chatSchema);
