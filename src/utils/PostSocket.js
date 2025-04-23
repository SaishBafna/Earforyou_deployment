import { Server as socketio } from 'socket.io';

let io;

export const initSocket = (server) => {
    const io = new socketio(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
        }
    });

    io.on('thread', (socket) => {
        console.log('New client connected');

        socket.on('joinUserRoom', (userId) => {
            socket.join(`user:${userId}`);
        });

        socket.on('joinPostRoom', (postId) => {
            socket.join(`post:${postId}`);
        });

        socket.on('joinCommentRoom', (commentId) => {
            socket.join(`comment:${commentId}`);
        });

        socket.on('threadDisconnect', () => {
            console.log('Client disconnected');
        });
    });

    return io;
};

export const emitSocketEvent = (room, event, data) => {
    if (io) {
        io.to(room).emit(event, data);
    }
};