import express from 'express';
import { createSurvey,getSurveys,getSurveyById,getSurveyStats } from '../../controllers/Survey/Survey.Controller.js';

const router = express.Router();

router.route('/').post(createSurvey).get(getSurveys);
router.route('/:id').get(getSurveyById);
router.route('/stats').get(getSurveyStats);

export default router;