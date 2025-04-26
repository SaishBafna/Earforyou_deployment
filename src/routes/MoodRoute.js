import { Router } from 'express';

const router = Router();

// Controller functions (import your controller here)
import { createMood, getMood, getAllUserMoods, getMoodStatistics, updateMood } from '../controllers/MoodController.js';
import { createStreak, getStreak } from '../controllers/Streak.js';
import { protect } from '../middlewares/auth/authMiddleware.js'; // Adjust the path as necessary
// Route to get all moods

router.post('/createMood', protect, createMood)

router.get('/getMood', protect, getMood)

router.get('/getAllUserMoods/:userId', getAllUserMoods)

router.get('/getMoodStatistics/:userId', getMoodStatistics)

router.put('/updateMood', updateMood)

router.post('/createStreak',protect, createStreak)

router.get('/getStreak/:userId', getStreak)





export default router;