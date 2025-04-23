// models/Comment.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const commentSchema = new Schema({
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  post: {
    type: Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true
  },
  parentComment: {
    type: Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  likes: {
    count: {
      type: Number,
      default: 0,
      min: 0
    },
    users: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  depth: {
    type: Number,
    default: 0,
    max: 5
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1, createdAt: -1 });

// Virtual for replies
commentSchema.virtual('replies', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parentComment',
  options: { sort: { createdAt: -1 } }
});

// Middleware to set depth
commentSchema.pre('save', async function(next) {
  if (this.parentComment) {
    const parent = await this.model('Comment').findById(this.parentComment);
    this.depth = parent ? parent.depth + 1 : 0;
    if (this.depth > 5) {
      throw new Error('Comment nesting too deep');
    }
  }
  next();
});

// Static method to get comment tree
commentSchema.statics.getCommentTree = async function(postId, depth = 3) {
  const comments = await this.find({ post: postId, depth: { $lte: depth } })
    .sort({ createdAt: -1 })
    .populate('author', 'username avatarUrl')
    .lean();
  
  const map = {};
  const roots = [];
  
  comments.forEach(comment => {
    map[comment._id] = { ...comment, replies: [] };
  });
  
  comments.forEach(comment => {
    if (comment.parentComment && map[comment.parentComment]) {
      map[comment.parentComment].replies.push(map[comment._id]);
    } else if (!comment.parentComment) {
      roots.push(map[comment._id]);
    }
  });
  
  return roots;
};

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;