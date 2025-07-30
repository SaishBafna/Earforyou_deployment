import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema({
    blocker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    blocked: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, {
    // Ensure one unique block relationship between users
    timestamps: true,
});

// Compound index to ensure one user can't block another more than once
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

const Block = mongoose.model('Block', blockSchema);

export default Block;