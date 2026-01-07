import express from 'express';
import { createOrUpdateGateway, getPaymentGateway } from '../controllers/Getway.js';
const router = express.Router();

router.get('/', getPaymentGateway);
router.post('/', createOrUpdateGateway);

export default router;
