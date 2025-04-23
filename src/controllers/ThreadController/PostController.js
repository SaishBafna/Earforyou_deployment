// controllers/postController.js
import Post from '../../models/ThreadPost/PostSchema.js';
import Comment from '../../models/ThreadPost/CommentSchema.js';
import User from '../../models/Users.js';
import UserEngagement from '../../models/ThreadPost/UserEngagement.js';
import { emitSocketEvent } from '../../utils/PostSocket.js';
const POSTS_PER_PAGE = 10;

// Helper function to update user engagement
const updateUserEngagement = async (userId, postId, action) => {
  const post = await Post.findById(postId).select('tags');
  if (!post) return;
  
  const engagement = await UserEngagement.findOneAndUpdate(
    { user: userId },
    {
      $push: {
        [action === 'like' ? 'likedPosts' : 'commentedPosts']: {
          post: postId,
          tags: post.tags,
          timestamp: new Date()
        }
      }
    },
    { upsert: true, new: true }
  );
  
  if (post.tags.length > 0) {
    const tagUpdates = post.tags.map(tag => ({
      updateOne: {
        filter: { user: userId, 'followedTags.tag': tag },
        update: { 
          $inc: { 'followedTags.$.weight': 0.5 },
          $set: { 'followedTags.$.lastEngaged': new Date() }
        }
      }
    }));
    
    const newTags = post.tags.filter(tag => 
      !engagement.followedTags.some(t => t.tag === tag)
    ).map(tag => ({
      tag,
      weight: 1,
      lastEngaged: new Date()
    }));
    
    if (newTags.length > 0) {
      tagUpdates.push({
        updateOne: {
          filter: { user: userId },
          update: { $push: { followedTags: { $each: newTags } } }
        }
      });
    }
    
    await UserEngagement.bulkWrite(tagUpdates);
  }
  
  engagement.updateEngagementScore();
  await engagement.save();
};

// Create a new post
export const createPost = async (req, res) => {
  try {
    const { content, tags } = req.body;
    const author = req.user._id;
    
    const post = new Post({
      content,
      tags: tags || [],
      author
    });
    
    await post.save();
    
    emitSocketEvent(`user:${author}`, 'post:created', post);
    
    res.status(201).json({
      success: true,
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get all posts with pagination and filtering
export const getPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || POSTS_PER_PAGE;
    const skip = (page - 1) * limit;
    
    const filter = { isDeleted: false };
    const sort = { createdAt: -1 };
    
    if (req.query.tags) {
      filter.tags = { $in: Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags] };
    }
    
    if (req.query.author) {
      filter.author = req.query.author;
    }
    
    if (req.query.popular) {
      sort.popularityScore = -1;
      sort.createdAt = -1;
    }
    
    const posts = await Post.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('author', 'username avatarUrl')
      .lean();
    
    if (req.user) {
      const userEngagement = await UserEngagement.findOne({ user: req.user._id });
      const likedPostIds = userEngagement?.likedPosts.map(lp => lp.post.toString()) || [];
      
      posts.forEach(post => {
        post.isLiked = likedPostIds.includes(post._id.toString());
      });
    }
    
    res.json({
      success: true,
      data: posts,
      pagination: {
        page,
        limit,
        total: await Post.countDocuments(filter)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get personalized feed for user
export const getPersonalizedFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || POSTS_PER_PAGE;
    const skip = (page - 1) * limit;
    
    const engagement = await UserEngagement.findOne({ user: userId });
    const followedTags = engagement?.followedTags.map(t => t.tag) || [];
    
    const pipeline = [
      { $match: { isDeleted: false } },
      { $addFields: {
          tagMatchScore: {
            $size: {
              $setIntersection: ["$tags", followedTags]
            }
          },
          isFollowingAuthor: {
            $in: ["$author", req.user.following || []]
          }
        }
      },
      { $sort: {
          isFollowingAuthor: -1,
          tagMatchScore: -1,
          popularityScore: -1,
          createdAt: -1
        }
      },
      { $skip: skip },
      { $limit: limit },
      { $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author'
        }
      },
      { $unwind: '$author' },
      { $project: {
          'author.password': 0,
          'author.email': 0
        }
      }
    ];
    
    const posts = await Post.aggregate(pipeline);
    
    const likedPostIds = engagement?.likedPosts.map(lp => lp.post.toString()) || [];
    posts.forEach(post => {
      post.isLiked = likedPostIds.includes(post._id.toString());
    });
    
    res.json({
      success: true,
      data: posts,
      pagination: {
        page,
        limit,
        total: await Post.countDocuments({ isDeleted: false })
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get single post by ID
export const getPostById = async (req, res) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      isDeleted: false
    }).populate('author', 'username avatarUrl')
      .populate('comments', 'content author createdAt');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    if (req.user) {
      const engagement = await UserEngagement.findOne({ user: req.user._id });
      post.isLiked = engagement?.likedPosts.some(lp => lp.post.equals(post._id)) || false;
    }
    
    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update a post
export const updatePost = async (req, res) => {
  try {
    const { content, tags } = req.body;
    
    const post = await Post.findOneAndUpdate(
      {
        _id: req.params.id,
        author: req.user._id,
        isDeleted: false
      },
      {
        content,
        tags: tags || []
      },
      { new: true, runValidators: true }
    );
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found or not authorized'
      });
    }
    
    emitSocketEvent(`post:${post._id}`, 'post:updated', post);
    
    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Soft delete a post
export const deletePost = async (req, res) => {
  try {
    const post = await Post.findOneAndUpdate(
      {
        _id: req.params.id,
        author: req.user._id,
        isDeleted: false
      },
      {
        isDeleted: true,
        deletedAt: new Date()
      },
      { new: true }
    );
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found or not authorized'
      });
    }
    
    emitSocketEvent(`post:${post._id}`, 'post:deleted', { id: post._id });
    
    res.json({
      success: true,
      data: { id: post._id }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Like/unlike a post
export const toggleLikePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;
    
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    const isLiked = post.likes.users.some(user => user.equals(userId));
    
    let updatedPost;
    if (isLiked) {
      updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          $pull: { 'likes.users': userId },
          $inc: { 'likes.count': -1 }
        },
        { new: true }
      );
      
      await UserEngagement.updateOne(
        { user: userId },
        { $pull: { likedPosts: { post: postId } } }
      );
    } else {
      updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          $addToSet: { 'likes.users': userId },
          $inc: { 'likes.count': 1 },
          $set: { lastActivityAt: new Date() }
        },
        { new: true }
      );
      
      await updateUserEngagement(userId, postId, 'like');
    }
    
    updatedPost.popularityScore = updatedPost.calculatePopularity();
    await updatedPost.save();
    
    emitSocketEvent(`post:${postId}`, 'post:likeUpdated', {
      postId,
      likesCount: updatedPost.likes.count,
      isLiked: !isLiked
    });
    
    res.json({
      success: true,
      data: {
        likesCount: updatedPost.likes.count,
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

// Get post analytics
export const getPostAnalytics = async (req, res) => {
  try {
    const postId = req.params.id;
    
    const post = await Post.findOne({
      _id: postId,
      $or: [
        { author: req.user._id },
        { /* admin condition if needed */ }
      ]
    });
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found or not authorized'
      });
    }
    
    const likesOverTime = await Post.aggregate([
      { $match: { _id: post._id } },
      { $unwind: '$likes.users' },
      { $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const commentsOverTime = await Comment.aggregate([
      { $match: { post: post._id } },
      { $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const topEngagers = await Comment.aggregate([
      { $match: { post: post._id } },
      { $group: {
          _id: '$author',
          commentCount: { $sum: 1 }
        }
      },
      { $sort: { commentCount: -1 } },
      { $limit: 5 },
      { $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $project: {
          'user.password': 0,
          'user.email': 0,
          commentCount: 1
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        postId: post._id,
        likesOverTime,
        commentsOverTime,
        topEngagers,
        popularityScore: post.popularityScore,
        reachEstimate: post.likes.count + post.commentsCount * 2
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};