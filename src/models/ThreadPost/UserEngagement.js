// models/UserEngagement.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const userEngagementSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  likedPosts: [{
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post'
    },
    tags: [String],
    timestamp: Date
  }],
  commentedPosts: [{
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post'
    },
    tags: [String],
    timestamp: Date
  }],
  followedTags: [{
    tag: String,
    weight: {
      type: Number,
      default: 1
    },
    lastEngaged: Date
  }],
  engagementScore: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
userEngagementSchema.index({ user: 1 });
userEngagementSchema.index({ 'followedTags.tag': 1 });

// Methods
userEngagementSchema.methods.updateEngagementScore = function() {
  const likeWeight = 1;
  const commentWeight = 2;
  const timeDecay = 0.99; // per day
  
  const now = new Date();
  const daysSinceAccountCreation = (now - this.createdAt) / (1000 * 60 * 60 * 24);
  
  const likeScore = this.likedPosts.reduce((sum, like) => {
    const daysSinceLike = (now - like.timestamp) / (1000 * 60 * 60 * 24);
    return sum + likeWeight * Math.pow(timeDecay, daysSinceLike);
  }, 0);
  
  const commentScore = this.commentedPosts.reduce((sum, comment) => {
    const daysSinceComment = (now - comment.timestamp) / (1000 * 60 * 60 * 24);
    return sum + commentWeight * Math.pow(timeDecay, daysSinceComment);
  }, 0);
  
  this.engagementScore = likeScore + commentScore;
  return this.engagementScore;
};

userEngagementSchema.methods.getRecommendedTags = function(limit = 5) {
  return this.followedTags
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(tag => tag.tag);
};

const UserEngagement = mongoose.model('UserEngagement', userEngagementSchema);
export default UserEngagement;