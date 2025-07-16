import express from 'express';
import { createSurvey,getSurveys,getSurveyById,getSurveyStats,paticularSurvey } from '../../controllers/Survey/Survey.Controller.js';
import { protect } from '../../middlewares/auth/authMiddleware.js';
const router = express.Router();

router.route('/').post(createSurvey).get(getSurveys);
router.route('/:id').get(getSurveyById);
router.route('/stats').get(getSurveyStats);
router.get('/surveys/:id', protect, paticularSurvey);  // This could cause the CastError

export default router;