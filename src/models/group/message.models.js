import mongoose, { Schema } from "mongoose";

const chatMessageSchema = new Schema(
    {
        sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        content: {
            type: String,
            trim: true
        },
        attachments: {
            type: [
                {
                    url: String,
                    localPath: String,
                    fileType: {
                        type: String,
                        enum: ['image', 'video', 'audio', 'document', 'other'],
                        default: 'other'
                    },
                    fileName: String,
                    size: Number
                }
            ],
            default: []
        },
        chat: {
            type: Schema.Types.ObjectId,
            ref: "Chat",
            required: true
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
        deletedFor: [{
            type: Schema.Types.ObjectId,
            ref: "User"
        }],
        edited: {
            type: Boolean,
            default: false
        },
        replyTo: {
            type: Schema.Types.ObjectId,
            ref: "ChatMessage"
        },
        reactions: [{
            user: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true
            },
            emoji: {
                type: String,
                required: true
            }
        }]
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

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);