import mongoose from 'mongoose';

const surveySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        mobile: {
            type: String,
            required: true,
        },
        overwhelmedFrequency: {
            type: String,
            required: true,
        },
        experiencedConditions: {
            type: [String],
            required: true,
        },
        awarenessLevel: {
            type: String,
            required: true,
        },
        comfortTalking: {
            type: String,
            required: true,
        },
        professionalHelp: {
            type: String,
            required: true,
        },
        supportBarriers: {
            type: [String],
            required: true,
        },
        recommendLikelihood: {
            type: String,
            required: true,
        },
        preferredFeature: {
            type: String,
            required: true,
        },
        desiredContent: {
            type: [String],
            required: true,
        },
        discoveryMethod: {
            type: String,
            required: true,
        },
        feedback: {
            type: String,
            required: true,
        }
    },
    {
        timestamps: true,
    }
);

const Survey = mongoose.model('Survey', surveySchema);

export default Survey;