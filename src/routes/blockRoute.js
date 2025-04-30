import express from 'express';
import { blockUser, unblockUser, checkBlockStatus, getBlockedUsers } from '../controllers/BlockUser/BlockController';

const router = express.Router();

router.post('/block', blockUser);
router.post('/unblock', unblockUser);
router.get('/check', checkBlockStatus);
router.get('/blocked-users/:userId', getBlockedUsers);

export default router;