import ThreadNotificationModel from '../models/ThreadNotification.js';
import User from '../models/Users.js';
import admin from 'firebase-admin';
import logger from '../config/logger.js';

/**
 * Stores a thread notification in the database
 * @param {Object} data - Notification data
 * @returns {Promise<Object>} The created notification
 */
export const createThreadNotification = async (data) => {
    try {
        const notification = new ThreadNotificationModel(data);
        await notification.save();
        return notification;
    } catch (error) {
        logger.error(`Error creating thread notification: ${error.message}`);
        throw new Error('Failed to create notification');
    }
};

/**
 * Sends a push notification via FCM
 * @param {string} userId - Recipient user ID
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 * @param {string} type - Notification type
 * @param {Object} metadata - Additional metadata
 */
export const sendPushNotification = async (userId, title, message, type, metadata = {}, screen) => {
    try {
        const user = await User.findById(userId).select('deviceToken username avatarUrl');
        if (!user) {
            logger.warn(`User not found: ${userId}`);
            return;
        }

        if (!user.deviceToken) {
            logger.warn(`No device token found for user: ${userId}`);
            return;
        }

        // Convert all metadata values to strings
        const stringifiedMetadata = {};
        Object.keys(metadata).forEach(key => {
            stringifiedMetadata[key] = metadata[key] != null ? String(metadata[key]) : '';
        });

        const payload = {
            notification: {
                title,
                body: message,
            },
            data: {
                type: String(type),
                ...stringifiedMetadata,
                screen: 'Notification',
                imageUrl: stringifiedMetadata.senderAvatar || 'https://investogram.ukvalley.com/avatars/default.png'
            },
            token: user.deviceToken,
            data: {
                screen: screen || 'Notification',
            }
        };

        await admin.messaging().send(payload);
        logger.info(`Push notification sent to user ${userId}`);
    } catch (error) {
        logger.error(`Error sending push notification to user ${userId}: ${error.message}`);
        // Don't throw error as we want to continue even if push notification fails
    }
};

/**
 * Combined function to create and send a notification
 * @param {Object} options - Notification options
 * @param {string} options.recipientId - Recipient user ID
 * @param {string} [options.senderId] - Sender user ID (optional)
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification body
 * @param {string} [options.postId] - Related post ID (optional)
 * @param {string} [options.commentId] - Related comment ID (optional)
 * @returns {Promise<Object>} The created notification
 */
export const notifyUser = async (options) => {
    try {
        const { recipientId, senderId, type, title, message, postId, commentId, screen } = options;

        // Get sender info if available
        let sender = null;
        if (senderId) {
            sender = await User.findById(senderId).select('username avatarUrl');
            if (!sender) {
                logger.warn(`Sender not found: ${senderId}`);
            }
        }

        // Create database notification
        const notification = await createThreadNotification({
            recipient: recipientId,
            sender: senderId,
            type,
            title,
            message,
            post: postId,
            comment: commentId,
            read: false,
            createdAt: new Date(),
        });

        // Send push notification
        await sendPushNotification(
            recipientId,
            title,
            message,
            type,
            {
                senderId: senderId || '',
                senderName: sender?.username || 'Someone',
                senderAvatar: sender?.avatarUrl,
                postId: postId || '',
                commentId: commentId || '',
                notificationId: notification._id.toString()
            },
            screen

        );

        return notification;
    } catch (error) {
        logger.error(`Error in notifyUser: ${error.message}`);
        throw new Error('Failed to send notification');
    }
};