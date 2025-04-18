// routes/postRoutes.js
import express from 'express';

import {
    createPost,
    getPosts,
    getPersonalizedFeed,
    getPostById,
    updatePost,
    deletePost,
    toggleLikePost,
    getPostAnalytics
} from '../../controllers/ThreadController/PostController.js';


import {
    createComment,
    getComments,
    updateComment,
    deleteComment,
    toggleLikeComment
} from '../../controllers/ThreadController/CommentController.js';
import { protect } from '../../middlewares/auth/authMiddleware.js';

const router = express.Router();
// Post routes
router.route('/')
    .post(protect, createPost)
    .get(getPosts);

router.route('/feed')
    .get(protect, getPersonalizedFeed);

router.route('/:id')
    .get(getPostById)
    .put(protect, updatePost)
    .delete(protect, deletePost);

router.route('/:id/like')
    .post(protect, toggleLikePost);

router.route('/:id/analytics')
    .get(protect, getPostAnalytics);

// Comment routes
router.route('/:postId/comments')
    .post(protect, createComment)
    .get(getComments);

router.route('/comments/:commentId')
    .put(protect, updateComment)
    .delete(protect, deleteComment);

router.route('/comments/:commentId/like')
    .post(protect, toggleLikeComment);

export default router;