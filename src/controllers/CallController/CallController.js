import createService from '../../servises/CallServices.js'
import logger from '../../logger/winston.logger.js';
import CallLog from '../../models/Talk-to-friend/callLogModel.js';
import User from '../../models/Users.js';

import Review from '../../models/LeaderBoard/Review.js';



// export const getRecentCalls = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { page = 1 } = req.query; // Default page number is 1
//     const PAGE_SIZE = 20; // 20 calls per page

//     console.log('Fetching calls for userId:', userId);

//     // Validate userId
//     if (!userId) {
//       return res.status(400).json({ message: 'User ID is required.' });
//     }

//     // Calculate pagination
//     const skip = (parseInt(page) - 1) * PAGE_SIZE;

//     // Retrieve recent call logs with pagination
//     const recentCalls = await CallLog.find({
//       $or: [{ caller: userId }, { receiver: userId }],
//     })
//       .sort({ startTime: -1, endTime: -1 })
//       .skip(skip) // Skip calls for previous pages
//       .limit(PAGE_SIZE) // Limit results to 20 per page
//       .populate('caller', 'username userType userCategory gender Language phone avatarUrl')
//       .populate('receiver', 'username userType userCategory gender Language phone avatarUrl')
//       .lean()
//       .exec();

//     // If no calls are found
//     if (!recentCalls || recentCalls.length === 0) {
//       return res.status(404).json({ message: 'No call history found for this page.' });
//     }


    

//     // Format calls and hide logged-in user's data
//     const formattedCalls = recentCalls.map(call => {
//       const formattedCall = {
//         _id: call._id,
//         status: call.status,
//         startTime: call.startTime,
//         endTime: call.endTime,
//         duration: call.duration,
//       };

//       // If caller is the logged-in user, only include receiver's data
//       if (call.caller._id.toString() === userId.toString()) {
//         formattedCall.caller = null; // or you could set it to a placeholder object
//         formattedCall.receiver = call.receiver;
//       }
//       // If receiver is the logged-in user, only include caller's data
//       else if (call.receiver._id.toString() === userId.toString()) {
//         formattedCall.caller = call.caller;
//         formattedCall.receiver = null; // or you could set it to a placeholder object
//       }
//       // In case neither matches (shouldn't happen), include both
//       else {
//         formattedCall.caller = call.caller;
//         formattedCall.receiver = call.receiver;
//       }

//       return formattedCall;
//     });

//     // Total count for pagination metadata
//     const totalCallsCount = await CallLog.countDocuments({
//       $or: [{ caller: userId }, { receiver: userId }]
//     });

//     // Pagination metadata
//     const totalPages = Math.ceil(totalCallsCount / PAGE_SIZE);

//     return res.status(200).json({
//       recentCalls: formattedCalls,
//       totalCalls: totalCallsCount,
//       currentPage: parseInt(page),
//       totalPages,
//       pageSize: PAGE_SIZE
//     });

//   } catch (error) {
//     console.error('Error fetching recent call history:', error);

//     if (error.name === 'CastError') {
//       return res.status(400).json({
//         message: 'Invalid user ID format.',
//         details: error.message
//       });
//     }

//     return res.status(500).json({
//       message: 'Server error, unable to fetch call history.',
//       details: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

export const getRecentCalls = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1 } = req.query; // Default page number is 1
    const PAGE_SIZE = 20; // 20 calls per page

    console.log('Fetching calls for userId:', userId);

    // Validate userId
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required.' });
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * PAGE_SIZE;

    // Retrieve recent call logs with pagination
    const recentCalls = await CallLog.find({
      $or: [{ caller: userId }, { receiver: userId }],
    })
      .sort({ startTime: -1, endTime: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .populate('caller', 'username userType userCategory phone avatarUrl')
      .populate('receiver', 'username userType userCategory phone avatarUrl')
      .lean()
      .exec();

    // If no calls are found
    if (!recentCalls || recentCalls.length === 0) {
      return res.status(404).json({ message: 'No call history found for this page.' });
    }

    // Format calls and hide logged-in user's data
    const formattedCalls = recentCalls.map(call => {
      const formattedCall = {
        _id: call._id,
        status: call.status,
        startTime: call.startTime,
        endTime: call.endTime,
        duration: call.duration,
      };

      // Check if caller exists and has _id
      const isCallerUser = call.caller && call.caller._id && call.caller._id.toString() === userId.toString();
      
      // Check if receiver exists and has _id
      const isReceiverUser = call.receiver && call.receiver._id && call.receiver._id.toString() === userId.toString();

      // If caller is the logged-in user, only include receiver's data
      if (isCallerUser) {
        formattedCall.caller = null;
        formattedCall.receiver = call.receiver || null;
      }
      // If receiver is the logged-in user, only include caller's data
      else if (isReceiverUser) {
        formattedCall.caller = call.caller || null;
        formattedCall.receiver = null;
      }
      // In case neither matches (shouldn't happen), include both if they exist
      else {
        formattedCall.caller = call.caller || null;
        formattedCall.receiver = call.receiver || null;
      }

      return formattedCall;
    });

    // Total count for pagination metadata
    const totalCallsCount = await CallLog.countDocuments({
      $or: [{ caller: userId }, { receiver: userId }]
    });

    // Pagination metadata
    const totalPages = Math.ceil(totalCallsCount / PAGE_SIZE);

    return res.status(200).json({
      recentCalls: formattedCalls,
      totalCalls: totalCallsCount,
      currentPage: parseInt(page),
      totalPages,
      pageSize: PAGE_SIZE
    });

  } catch (error) {
    console.error('Error fetching recent call history:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: 'Invalid user ID format.',
        details: error.message
      });
    }

    return res.status(500).json({
      message: 'Server error, unable to fetch call history.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};



/**
 * Initiates a call.
 */
export const initiateCall = async (req, res) => {
  const { callerId, receiverId } = req.body;

  if (!callerId || !receiverId) {
    logger.error('Caller ID or Receiver ID missing in request body');
    return res.status(400).json({ error: 'Caller ID and Receiver ID are required' });
  }

  try {
    const response = await createService.initiateCall(callerId, receiverId);

    if (!response.success) {
      // Handle case where the receiver is busy
      return res.status(409).json({ error: response.message });
    }

    res.json(response);
  } catch (error) {
    logger.error(`Error initiating call between caller ${callerId} and receiver ${receiverId}: ${error.message}`);
    res.status(500).json({ error: 'Error initiating call' });
  }
};

/**
 * Accepts an incoming call.
 */
export const acceptCall = async (req, res) => {
  const { receiverId, callerId } = req.body;

  if (!receiverId || !callerId) {
    logger.error('Caller ID or Receiver ID missing in request body');
    return res.status(400).json({ error: 'Caller ID and Receiver ID are required' });
  }

  try {
    const response = await createService.acceptCall(receiverId, callerId);
    res.json(response);
  } catch (error) {
    logger.error(`Error accepting call between caller ${callerId} and receiver ${receiverId}: ${error.message}`);
    res.status(500).json({ error: 'Error accepting call' });
  }
};

/**
 * Rejects an incoming call or logs a missed call if the receiver is unavailable.
 */
export const rejectCall = async (req, res) => {
  const { receiverId, callerId } = req.body;

  if (!receiverId || !callerId) {
    logger.error('Caller ID or Receiver ID missing in request body');
    return res.status(400).json({ error: 'Caller ID and Receiver ID are required' });
  }

  try {
    const response = await createService.rejectCall(receiverId, callerId);
    res.json(response);
  } catch (error) {
    logger.error(`Error rejecting call between caller ${callerId} and receiver ${receiverId}: ${error.message}`);
    res.status(500).json({ error: 'Error rejecting call' });
  }
};

/**
 * Ends an ongoing call.
 */
export const endCall = async (req, res) => {
  const { callerId, receiverId } = req.body;

  if (!callerId || !receiverId) {
    logger.error('Caller ID or Receiver ID missing in request body');
    return res.status(400).json({ error: 'Caller ID and Receiver ID are required' });
  }

  try {
    const response = await createService.endCall(callerId, receiverId);
    res.json(response);
  } catch (error) {
    logger.error(`Error ending call between caller ${callerId} and receiver ${receiverId}: ${error.message}`);
    res.status(500).json({ error: 'Error ending call' });
  }
};

/**
 * Handles missed calls.
 */
export const handleMissedCall = async (req, res) => {
  const { callerId, receiverId } = req.body;

  if (!callerId || !receiverId) {
    logger.error('Caller ID or Receiver ID missing in request body');
    return res.status(400).json({ error: 'Caller ID and Receiver ID are required' });
  }

  try {
    const response = await createService.handleMissedCall(callerId, receiverId);
    res.json(response);
  } catch (error) {
    logger.error(`Error handling missed call between caller ${callerId} and receiver ${receiverId}: ${error.message}`);
    res.status(500).json({ error: 'Error handling missed call' });
  }
};


