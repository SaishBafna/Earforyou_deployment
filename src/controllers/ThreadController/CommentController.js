// controllers/commentController.js
import Comment from '../../models/ThreadPost/CommentSchema.js';
import Post from '../../models/ThreadPost/PostSchema.js';
import UserEngagement from '../../models/ThreadPost/UserEngagement.js';
import { emitSocketEvent } from '../../utils/PostSocket.js';
// Create a comment
export const createComment = async (req, res) => {
  try {
    const { content, parentCommentId } = req.body;
    const postId = req.params.postId;
    const author = req.user._id;
    
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment || parentComment.post.toString() !== postId) {
        return res.status(400).json({
          success: false,
          error: 'Invalid parent comment'
        });
      }
    }
    
    const comment = new Comment({
      content,
      author,
      post: postId,
      parentComment: parentCommentId || null
    });
    
    await comment.save();
    
    await Post.findByIdAndUpdate(postId, {
      $inc: { commentsCount: 1 },
      $set: { lastActivityAt: new Date() }
    });
    
    post.popularityScore = post.calculatePopularity();
    await post.save();
    
    const populatedComment = await Comment.findById(comment._id)
      .populate('author', 'username avatar');
    
    emitSocketEvent(`post:${postId}`, 'comment:created', populatedComment);
    if (parentCommentId) {
      emitSocketEvent(`comment:${parentCommentId}`, 'reply:created', populatedComment);
    }
    
    res.status(201).json({
      success: true,
      data: populatedComment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get comments for a post
export const getComments = async (req, res) => {
  try {
    const postId = req.params.postId;
    const depth = parseInt(req.query.depth) || 3;
    
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    const comments = await Comment.getCommentTree(postId, depth);
    
    if (req.user) {
      const engagement = await UserEngagement.findOne({ user: req.user._id });
      const likedCommentIds = engagement?.likedPosts
        .filter(lp => lp.post instanceof mongoose.Types.ObjectId)
        .map(lp => lp.post.toString()) || [];
      
      const flattenComments = (comments) => {
        comments.forEach(comment => {
          comment.isLiked = likedCommentIds.includes(comment._id.toString());
          if (comment.replies && comment.replies.length > 0) {
            flattenComments(comment.replies);
          }
        });
      };
      
      flattenComments(comments);
    }
    
    res.json({
      success: true,
      data: comments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update a comment
export const updateComment = async (req, res) => {
  try {
    const { content } = req.body;
    const commentId = req.params.commentId;
    
    const comment = await Comment.findOneAndUpdate(
      {
        _id: commentId,
        author: req.user._id,
        isDeleted: false
      },
      { content },
      { new: true, runValidators: true }
    ).populate('author', 'username avatar');
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found or not authorized'
      });
    }
    
    emitSocketEvent(`comment:${commentId}`, 'comment:updated', comment);
    emitSocketEvent(`post:${comment.post}`, 'comment:updated', comment);
    
    res.json({
      success: true,
      data: comment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Delete a comment (soft delete)
export const deleteComment = async (req, res) => {
  try {
    const commentId = req.params.commentId;
    
    const comment = await Comment.findOneAndUpdate(
      {
        _id: commentId,
        author: req.user._id,
        isDeleted: false
      },
      { isDeleted: true },
      { new: true }
    );
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found or not authorized'
      });
    }
    
    await Post.findByIdAndUpdate(comment.post, {
      $inc: { commentsCount: -1 }
    });
    
    emitSocketEvent(`comment:${commentId}`, 'comment:deleted', { id: commentId });
    emitSocketEvent(`post:${comment.post}`, 'comment:deleted', { id: commentId });
    
    res.json({
      success: true,
      data: { id: commentId }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Like/unlike a comment
export const toggleLikeComment = async (req, res) => {
  try {
    const commentId = req.params.commentId;
    const userId = req.user._id;
    
    const comment = await Comment.findById(commentId);
    if (!comment || comment.isDeleted) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }
    
    const isLiked = comment.likes.users.some(user => user.equals(userId));
    
    let updatedComment;
    if (isLiked) {
      updatedComment = await Comment.findByIdAndUpdate(
        commentId,
        {
          $pull: { 'likes.users': userId },
          $inc: { 'likes.count': -1 }
        },
        { new: true }
      );
    } else {
      updatedComment = await Comment.findByIdAndUpdate(
        commentId,
        {
          $addToSet: { 'likes.users': userId },
          $inc: { 'likes.count': 1 }
        },
        { new: true }
      );
    }
    
    emitSocketEvent(`comment:${commentId}`, 'comment:likeUpdated', {
      commentId,
      likesCount: updatedComment.likes.count,
      isLiked: !isLiked
    });
    
    res.json({
      success: true,
      data: {
        likesCount: updatedComment.likes.count,
        isLiked: !isLiked
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};