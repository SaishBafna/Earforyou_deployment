import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const StreakSchema = new Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        streakCount: {
            type: Number,
            default: 0,
        },
        lastUpdated: {
            type: Date,
            default: Date.now,
        },
        dailyLogs: [
            {
                date: {
                    type: Date,
                    required: true,
                },
               
            },
        ],
    },
    {
        timestamps: true,
    }
);

const Streak = models.Streak || model('Streak', StreakSchema);

export default Streak;