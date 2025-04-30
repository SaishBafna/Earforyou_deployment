import mongoose from 'mongoose';

const ThreadNotificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
    },
    comment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment'
    },
    type: {
        type: String,
        required: true,
        enum: [
            'post_like',
            'post_comment',
            'comment_reply',
            'post_mention',
            'comment_mention',
            'comment_like',
            'new_follower',
            'post_created',
            'like',
            'comment'
        ]
    },
    message: {
        type: String,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for faster queries
ThreadNotificationSchema.index({ recipient: 1, isRead: 1 });
ThreadNotificationSchema.index({ createdAt: -1 });

const ThreadNotification = mongoose.model('ThreadNotification', ThreadNotificationSchema);

export default ThreadNotification;