// models/Post.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const postSchema = new Schema({
  content: {
    type: String,
    required: [true, 'Post content is required'],
    trim: true,
    maxlength: [5000, 'Post cannot exceed 5000 characters']
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tags: {
    type: [String],
    default: [],
    validate: {
      validator: function(tags) {
        return tags.length <= 10;
      },
      message: 'Cannot have more than 10 tags'
    }
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
  commentsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  popularityScore: {
    type: Number,
    default: 0,
    index: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  lastActivityAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ tags: 1, popularityScore: -1, createdAt: -1 });
postSchema.index({ popularityScore: -1, createdAt: -1 });

// Virtual for comments
postSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'post',
  options: { sort: { createdAt: -1 } }
});

// Middleware to update popularity score
postSchema.pre('save', function(next) {
  this.popularityScore = this.calculatePopularity();
  next();
});

// Method to calculate popularity score
postSchema.methods.calculatePopularity = function() {
  const likesWeight = 2;
  const commentsWeight = 3;
  const timeDecay = 0.95; // per hour
  
  const hoursSinceCreation = (Date.now() - this.createdAt) / (1000 * 60 * 60);
  const timeFactor = Math.pow(timeDecay, hoursSinceCreation);
  
  return (this.likes.count * likesWeight + this.commentsCount * commentsWeight) * timeFactor;
};

const Post = mongoose.model('Post', postSchema);
export default Post;