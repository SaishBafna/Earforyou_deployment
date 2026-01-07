import { Schema, model } from 'mongoose';

const streakSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    currentStreak: {
        type: Number,
        default: 0
    },
    longestStreak: {
        type: Number,
        default: 0
    },
    lastLogDate: {
        type: Date,
        default: null
    },
    lastResetDate: {
        type: Date,
        default: null
    },
    activityLogs: [{
        logDate: {
            type: Date,
            required: true
        },
        activity: {
            type: String,
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
streakSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Method to update streak
streakSchema.methods.updateStreak = async function (activity) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day

    const lastLog = this.lastLogDate ? new Date(this.lastLogDate) : null;
    lastLog?.setHours(0, 0, 0, 0);

    // Check if last log was yesterday
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (!lastLog || lastLog < yesterday) {
        // Missed a day, reset streak
        this.currentStreak = 1;
        this.lastResetDate = today;
    } else if (lastLog.getTime() === yesterday.getTime()) {
        // Consecutive day, increment streak
        this.currentStreak += 1;
    } else if (lastLog.getTime() === today.getTime()) {
        // Already logged today, no streak change
        return this;
    }

    // Update longest streak
    if (this.currentStreak > this.longestStreak) {
        this.longestStreak = this.currentStreak;
    }

    // Update last log date and add activity log
    this.lastLogDate = today;
    this.activityLogs.push({
        logDate: today,
        activity
    });

    await this.save();
    return this;
};

// Method to get streak stats
streakSchema.statics.getStreakStats = async function (userId) {
    const streak = await this.findOne({ userId });
    if (!streak) {
        return { currentStreak: 0, longestStreak: 0, lastLogDate: null };
    }
    return {
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastLogDate: streak.lastLogDate,
        totalLogs: streak.activityLogs.length
    };
};

export default model('Streak', streakSchema);