import Block from "../../models/Block";
import User from "../../models/Users";
// Block a user
export const blockUser = async (req, res) => {
  try {
    const { blockerId, blockedId } = req.body;

    // Check if users exist
    const blocker = await User.findById(blockerId);
    const blocked = await User.findById(blockedId);

    if (!blocker || !blocked) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if block already exists
    const existingBlock = await Block.findOne({ blocker: blockerId, blocked: blockedId });
    if (existingBlock) {
      return res.status(400).json({ message: 'User is already blocked' });
    }

    // Create new block
    const block = new Block({
      blocker: blockerId,
      blocked: blockedId,
    });

    await block.save();

    res.status(201).json({
      message: 'User blocked successfully',
      block,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error blocking user', error: error.message });
  }
};

// Unblock a user
export const unblockUser = async (req, res) => {
  try {
    const { blockerId, blockedId } = req.body;

    const block = await Block.findOneAndDelete({
      blocker: blockerId,
      blocked: blockedId,
    });

    if (!block) {
      return res.status(404).json({ message: 'Block relationship not found' });
    }

    res.status(200).json({
      message: 'User unblocked successfully',
      block,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error unblocking user', error: error.message });
  }
};

// Check if a user is blocked
export const checkBlockStatus = async (req, res) => {
  try {
    const { blockerId, blockedId } = req.query;

    const block = await Block.findOne({
      blocker: blockerId,
      blocked: blockedId,
    });

    res.status(200).json({
      isBlocked: !!block,
      block,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error checking block status', error: error.message });
  }
};

// Get all blocked users for a specific user
export const getBlockedUsers = async (req, res) => {
  try {
    const { userId } = req.params;

    const blockedUsers = await Block.find({ blocker: userId })
      .populate('blocked', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json(blockedUsers);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching blocked users', error: error.message });
  }
};