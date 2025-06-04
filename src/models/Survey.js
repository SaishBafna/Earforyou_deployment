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
        nervousnessFrequency: {
            type: String,
            required: true,
        },
        panicAttack: {
            type: String,
            required: true,
        },
        strategies: {
            type: [String],
            required: true,
        },
        effectiveness: {
            type: String,
            required: true,
        },
        hasResources: {
            type: String,
            required: true,
        },
        resourcesUsed: {
            type: [String],
            default: [],
        },
        diagnosed: {
            type: String,
            required: true,
        },
        selfSuspect: {
            type: String,
            required: true,
        },
        confidence: {
            type: String,
            required: true,
        },
        treatments: {
            type: [String],
            required: true,
        },
        infoSources: {
            type: [String],
            required: true,
        },
        stigma: {
            type: String,
            required: true,
        },
        awareness: {
            type: String,
            required: true,
        },
        likelihood: {
            type: String,
            required: true,
        },
        desiredFeatures: {
            type: [String],
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

const Survey = mongoose.model('Survey', surveySchema);

export default Survey;