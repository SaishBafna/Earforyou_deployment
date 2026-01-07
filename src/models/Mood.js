import { Schema, model } from 'mongoose';

// Define the Mood Schema
const MoodSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    mood: {
        type: String,
        enum: ['happy', 'sad', 'angry', 'calm', 'excited', 'neutral'],
        required: true
    },
    moodScore: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: function () {
            const moodScores = {
                happy: 90,
                sad: 20,
                angry: 30,
                calm: 70,
                excited: 80,
                neutral: 50
            };
            return moodScores[this.mood];
        }
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 200
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Static method to calculate mood trends
MoodSchema.statics.getMoodTrends = async function (userId, days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const moods = await this.find({
        userId,
        createdAt: { $gte: startDate }
    }).sort({ createdAt: 1 });

    return moods.map(mood => ({
        date: mood.createdAt,
        mood: mood.mood,
        moodScore: mood.moodScore
    }));
};

// Create the Mood model
export const Mood = model('Mood', MoodSchema);