import mongoose from "mongoose";
import  { Mood } from "../models/Mood.js"; // Importing the Mood model


// Ensure only one mood entry per day for a user
export async function createMood(req, res) {
    try {
        const userId = req.user.id; // Extracting from req.user

        const { mood, notes } = req.body; // Extracting from req.body

        // Check if a mood entry already exists for the user on the same day
        const today = new Date();
        // Set time to the start of the day
        today.setUTCHours(0, 0, 0, 0);

        const existingMood = await Mood.findOne({
            userId,
            createdAt: { $gte: today }
        });

        if (existingMood) {
            return res.status(400).json({ message: "Mood entry already exists for today" });
        }

        const newMood = new Mood({ userId, mood, notes });
        const savedMood = await newMood.save();
        res.status(201).json(savedMood);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}
// Get a mood by ID
export async function getMood(req, res) {
    try {
       const userId= req.user.id

        const mood = await Mood.findOne({userId});
        if (!mood) {
            return res.status(404).json({ message: 'Mood not found' });
        }
        res.status(200).json(mood);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// Get all moods for a user
export async function getAllUserMoods(req, res) {
    try {
        const { userId } = req.params; // Extracting from req.params
        const moods = await Mood.find({ userId });
        res.status(200).json(moods);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// Get basic mood statistics for a user
export async function getMoodStatistics(req, res) {
    try {
        const { userId } = req.params; // Extracting from req.params

        // Calculate the date 7 days ago from today
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const stats = await Mood.aggregate([
            { 
                $match: { 
                    userId: mongoose.Types.ObjectId(userId),
                    createdAt: { $gte: sevenDaysAgo } // Filter for the last 7 days
                } 
            },
            {
                $group: {
                    _id: '$mood',
                    count: { $sum: 1 }
                }
            }
        ]);
        res.status(200).json(stats);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// Update a mood entry
export async function updateMood(req, res) {
    try {
        const { id } = req.params; // Extracting from req.params
        const { mood, notes } = req.body; // Extracting from req.body
        const updatedMood = await Mood.findByIdAndUpdate(
            id,
            { mood, notes },
            { new: true }
        );
        if (!updatedMood) {
            return res.status(404).json({ message: 'Mood not found' });
        }
        res.status(200).json(updatedMood);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}