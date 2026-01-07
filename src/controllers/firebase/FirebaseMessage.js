// controllers/notificationController.js
// import { Console } from 'winston/lib/winston/transports/index.js';
import firebaseConfig from '../../config/firebaseConfig.js';
import User from '../../models/Users.js';
import admin from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';
import { ChatMessage } from '../../models/message.models.js';
import { Chat } from '../../models/chat.modal.js';

// Function to send notification to a single user
const sendSingleNotification = async (deviceToken, title, body, chatId, messageId, senderId, senderName, senderAvatar) => {
  const message = {
    notification: {
      title,
      body,
    },
    token: deviceToken,
    data: {
      screen: 'Chat',
      params: JSON.stringify({
        chatId: chatId,
        messageId: messageId,
        type: 'chat_message',
        AgentID: senderId,
        friendName: senderName,
        imageurl: senderAvatar || '',
      })
    },
  };

  try {
    return await firebaseConfig.messaging().send(message);
  } catch (error) {
    console.error(`Error sending notification to token ${deviceToken}:`, error);
    return null;
  }
};

// Function to send notification to multiple users

// export const sendBulkNotification = async (req, res) => {
//   const { title, body } = req.body;

//   try {
//     // Fetch all users who have a device token
//     const users = await User.find({ 
//       deviceToken: { $exists: true, $ne: null } 
//     });

//     if (!users || users.length === 0) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'No users with device tokens found' 
//       });
//     }

//     // Create an array of notification promises
//     const notificationPromises = users.map(user => 
//       sendSingleNotification(user.deviceToken, title, body)
//     );

//     // Send notifications in parallel and wait for all to complete
//     const results = await Promise.allSettled(notificationPromises);

//     // Count successful and failed notifications
//     const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
//     const failureCount = results.length - successCount;

//     return res.status(200).json({
//       success: true,
//       message: 'Bulk notifications processed',
//       summary: {
//         total: results.length,
//         successful: successCount,
//         failed: failureCount
//       }
//     });

//   } catch (error) {
//     console.error('Error sending bulk notifications:', error);
//     return res.status(500).json({ 
//       success: false, 
//       message: 'Failed to process bulk notifications', 
//       error: error.message 
//     });
//   }
// };




const BATCH_SIZE = 450;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sendNotificationWithRetry = async (message, maxRetries = MAX_RETRIES) => {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await getMessaging().sendEachForMulticast(message);
      return result;
    } catch (error) {
      lastError = error;
      console.log(`Retry attempt ${attempt + 1} failed:`, error.message);

      if (attempt < maxRetries - 1) {
        await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
      }
    }
  }

  throw lastError;
};

export const sendBulkNotification = async (req, res) => {
  const { title, body } = req.body;

  try {
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Title and body are required fields'
      });
    }

    const users = await User.find(
      { deviceToken: { $exists: true, $ne: null } },
      { deviceToken: 1 }
    ).lean();

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: 'No device tokens found'
      });
    }

    const tokens = users.map(({ deviceToken }) => deviceToken);
    const batches = Array.from(
      { length: Math.ceil(tokens.length / BATCH_SIZE) },
      (_, i) => tokens.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
    );

    let totalSuccessful = 0;
    let totalFailed = 0;
    const allInvalidTokens = [];
    const failedTokens = [];

    for (const batchTokens of batches) {
      const message = {
        tokens: batchTokens,
        notification: {
          title,
          body
        },
        android: {
          priority: 'high',
          notification: {
            priority: 'high'
          }
        },
        apns: {
          payload: {
            aps: {
              priority: 10,
              contentAvailable: true
            }
          },
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert'
          }
        },
        webpush: {
          headers: {
            Urgency: 'high'
          }
        }

      };

      try {
        const result = await sendNotificationWithRetry(message);

        totalSuccessful += result.successCount;
        totalFailed += result.failureCount;

        // Process failures and collect invalid tokens
        if (result.failureCount > 0) {
          result.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const token = batchTokens[idx];

              if (resp.error?.code === 'messaging/invalid-registration-token' ||
                resp.error?.code === 'messaging/registration-token-not-registered') {
                allInvalidTokens.push(token);
              } else {
                // Store tokens that failed for other reasons
                failedTokens.push({
                  token,
                  error: resp.error?.message || 'Unknown error'
                });
              }
            }
          });
        }
      } catch (error) {
        console.error(`Batch failed after all retries:`, error);
        totalFailed += batchTokens.length;
        failedTokens.push(...batchTokens.map(token => ({
          token,
          error: error.message
        })));
      }
    }

    // Clean up invalid tokens
    if (allInvalidTokens.length > 0) {
      await User.updateMany(
        { deviceToken: { $in: allInvalidTokens } },
        { $unset: { deviceToken: "" } }
      );
    }

    // Try to resend to failed tokens one last time
    if (failedTokens.length > 0) {
      const retryTokens = failedTokens.map(ft => ft.token);
      try {
        const retryMessage = {
          tokens: retryTokens,
          notification: {
            title,
            body
          }
        };

        const retryResult = await sendNotificationWithRetry(retryMessage, 1);
        totalSuccessful += retryResult.successCount;
        totalFailed -= retryResult.successCount;
      } catch (error) {
        console.error('Final retry batch failed:', error);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Notifications sent',
      summary: {
        successful: totalSuccessful,
        failed: totalFailed,
        total: tokens.length,
        invalidTokensRemoved: allInvalidTokens.length,
        failedTokens: failedTokens.length
      }
    });

  } catch (error) {
    console.error('Error sending multicast:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send notifications',
      error: error.message
    });
  }
};



// Original single user notification function (kept for backward compatibility)


// export const sendPushNotification = async (req, res) => {
//   const loginuserid = req.user.id || req.user._id;
//   const { userId } = req.body

//   try {
//     const user = await User.findById(userId);
//     const loginuser = await User.findById(loginuserid);

//     console.log("user", user);
//     console.log("user", user.deviceToken);

//     if (!user || !user.deviceToken) {
//       console.log()
//       return res.status(404).json({
//         success: false,
//         message: 'User or device token not found'
//       });
//     }
//     const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : 'Unknown Person';
//     // Create body text with user's name
//     const body = `Your True Listener ${capitalize(loginuser.username) || capitalize(user.name) || 'Unknown Person'}`;
//     const title = `Are you free now, ${capitalize(user.username) || capitalize(user.name) || 'Unknown Person'}? If Yes, Let's Connect Over A Call`;

//     const response = await sendSingleNotification(user.deviceToken, title, body);



//     if (!response) {
//       throw new Error('Failed to send notification');
//     }

//     return res.status(200).json({
//       success: true,
//       message: 'Notification sent!',
//       response
//     });
//   } catch (error) {
//     console.error('Error sending notification:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to send notification',
//       error: error.message
//     });
//   }
// };



export const sendPushNotification = async (req, res) => {
  const loginUserId = req.user.id || req.user._id;
  const { userId } = req.body; // The user ID to send notification to

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'Recipient user ID is required'
    });
  }

  try {
    // Get the current user (sender)
    const currentUser = await User.findById(loginUserId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Current user not found'
      });
    }

    // Get the recipient user
    const recipientUser = await User.findById(userId);
    if (!recipientUser || !recipientUser.deviceToken) {
      return res.status(404).json({
        success: false,
        message: 'Recipient user not found or device token not available'
      });
    }

    // Find a chat between these two users
    const chat = await Chat.findOne({
      participants: { $all: [loginUserId, userId] }
    }).sort({ updatedAt: -1 }).limit(1);

    let chatId = null;
    let messageId = null;

    if (chat) {
      chatId = chat._id;
      // Get the most recent message in the chat if chat exists
      const recentMessage = await ChatMessage.findOne({
        chat: chat._id
      }).sort({ createdAt: -1 }).limit(1);

      if (recentMessage) {
        messageId = recentMessage._id;
      }
    }

    // Prepare notification content
    const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : 'Unknown Person';
    const recipientName = capitalize(recipientUser.username) || capitalize(recipientUser.name) || 'User';
    const senderName = capitalize(currentUser.username) || capitalize(currentUser.name) || 'Someone';

    const title = `New message from ${senderName}`;
    const body = `${senderName} wants to connect with you`;

    // Send notification
    const response = await sendSingleNotification(
      recipientUser.deviceToken,
      title,
      body,
      chatId,
      messageId,
      currentUser._id,
      senderName,
      currentUser.avatarUrl
    );

    if (!response) {
      throw new Error('Failed to send notification');
    }

    return res.status(200).json({
      success: true,
      message: 'Notification sent successfully!',
      response
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
};

export const getValidTokenCount = async (req, res) => {
  try {
    const count = await User.countDocuments({
      deviceToken: { $exists: true, $ne: null }
    });

    const usersWithTokens = await User.find(
      { deviceToken: { $exists: true, $ne: null } },
      { username: 1, deviceToken: 1, _id: 0 }
    ).lean();

    return res.status(200).json({
      success: true,
      totalCount: count,
      users: usersWithTokens,
      message: `Found ${count} users with valid device tokens`
    });

  } catch (error) {
    console.error('Error counting valid tokens:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to count valid device tokens'
    });
  }
};