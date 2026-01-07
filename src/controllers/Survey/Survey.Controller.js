import Survey from "../../models/Survey.js";

import User from "../../models/Users.js";

// @desc    Create a new survey
// @route   POST /api/surveys
// @access  Public
export const createSurvey = async (req, res) => {
    try {
        const {
            name,
            email,
            mobile,
            overwhelmedFrequency,
            experiencedConditions = [],
            awarenessLevel,
            comfortTalking,
            professionalHelp,
            supportBarriers = [],
            recommendLikelihood,
            preferredFeature,
            desiredContent = [],
            discoveryMethod,
            feedback = ''
        } = req.body;

        // Validate required fields
        const requiredFields = {
            name,
            overwhelmedFrequency,
            awarenessLevel,
            comfortTalking,
            professionalHelp,
            recommendLikelihood,
            preferredFeature,
            discoveryMethod
        };

        for (const [field, value] of Object.entries(requiredFields)) {
            if (!value || (typeof value === 'string' && value.trim() === '')) {
                return res.status(400).json({
                    success: false,
                    message: `${field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} is required.`
                });
            }
        }

        // Validate at least one contact method is provided
        if ((!email || email.trim() === '') && (!mobile || mobile.trim() === '')) {
            return res.status(400).json({
                success: false,
                message: 'Either email or mobile number must be provided.'
            });
        }

        // Validate email format if provided
        if (email && email.trim() !== '') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid email address.'
                });
            }
        }

        // Validate mobile format if provided
        if (mobile && mobile.trim() !== '') {
            const mobileRegex = /^[0-9]{10,15}$/;
            if (!mobileRegex.test(mobile.trim())) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid mobile number (10-15 digits).'
                });
            }
        }

        // Validate array fields
        const arrayFields = {
            experiencedConditions,
            supportBarriers,
            desiredContent
        };

        for (const [field, value] of Object.entries(arrayFields)) {
            if (!Array.isArray(value)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid data format for ${field.replace(/([A-Z])/g, ' $1')}. Expected an array.`
                });
            }
        }

        // Check for existing survey
        const existingConditions = [];
        if (email && email.trim() !== '') {
            existingConditions.push({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
        }
        if (mobile && mobile.trim() !== '') {
            existingConditions.push({ mobile: mobile.trim() });
        }

        if (existingConditions.length > 0) {
            const existingSurvey = await Survey.findOne({
                $or: existingConditions
            });

            if (existingSurvey) {
                return res.status(409).json({
                    success: false,
                    message: 'A survey with this email or mobile number already exists.',
                    existingSurveyId: existingSurvey._id
                });
            }
        }

        // Create new survey
        const surveyData = {
            name: name.trim(),
            email: email ? email.trim() : undefined,
            mobile: mobile ? mobile.trim() : undefined,
            overwhelmedFrequency,
            experiencedConditions: experiencedConditions.map(item => item.trim()),
            awarenessLevel,
            comfortTalking,
            professionalHelp,
            supportBarriers: supportBarriers.map(item => item.trim()),
            recommendLikelihood,
            preferredFeature,
            desiredContent: desiredContent.map(item => item.trim()),
            discoveryMethod,
            feedback: feedback.trim()
        };

        const survey = new Survey(surveyData);
        const createdSurvey = await survey.save();

        // Success response
        res.status(201).json({
            success: true,
            message: 'Survey created successfully.',
            data: {
                id: createdSurvey._id,
                name: createdSurvey.name,
                email: createdSurvey.email,
                mobile: createdSurvey.mobile,
                createdAt: createdSurvey.createdAt
            }
        });

    } catch (error) {
        console.error('Survey creation error:', error);

        // Handle specific MongoDB errors
        if (error.name === 'ValidationError') {
            const errors = {};
            for (const field in error.errors) {
                errors[field] = error.errors[field].message;
            }
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
        }

        // Handle duplicate key errors
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'A survey with this email or mobile number already exists.'
            });
        }

        // Generic error response
        res.status(500).json({
            success: false,
            message: 'Internal server error while creating survey',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};



export const getSurveysbyEmail = async (req, res) => {
    try {
        const UserId = req.user.id || req.user._id;
        const user = await User.findById(UserId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const email = user.email;
        const Phone = user.phone;
        const surveys = await Survey.findOne({ $or: [{ email: email }, { mobile: Phone }] });
        console.log("surveys", user)
        if (!surveys) {
            return res.status(404).json({ success: false, message: "No surveys found" });
        }

        res.status(200).json({ success: true, message: "Surveys found", data: surveys });
    } catch (error) {
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

// @desc    Get all surveys
// @route   GET /api/surveys
// @access  Public
export const getSurveys = async (req, res) => {
    try {
        const surveys = await Survey.find({});
        res.json(surveys);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get survey by ID
// @route   GET /api/surveys/:id
// @access  Public
export const getSurveyById = async (req, res) => {
    try {
        const survey = await Survey.findById(req.params.id);

        if (survey) {
            res.json(survey);
        } else {
            res.status(404).json({ message: 'Survey not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get survey statistics
// @route   GET /api/surveys/stats
// @access  Public
export const getSurveyStats = async (req, res) => {
    try {
        const totalSurveys = await Survey.countDocuments();
        const panicAttackStats = await Survey.aggregate([
            { $group: { _id: '$panicAttack', count: { $sum: 1 } } }
        ]);
        const diagnosedStats = await Survey.aggregate([
            { $group: { _id: '$diagnosed', count: { $sum: 1 } } }
        ]);
        const stigmaStats = await Survey.aggregate([
            { $group: { _id: '$stigma', count: { $sum: 1 } } }
        ]);

        res.json({
            totalSurveys,
            panicAttackStats,
            diagnosedStats,
            stigmaStats,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};