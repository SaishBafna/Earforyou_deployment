import { Server } from "socket.io";
import Client from "socket.io-client";
import http from "http";
import { setupWebRTC } from "../../src/sockets/webrtc.js"; // adjust path

let io, serverSocket, clientSocket, httpServer;

beforeAll((done) => {
  httpServer = http.createServer();
  io = new Server(httpServer);

  setupWebRTC(io);

  httpServer.listen(() => {
    const port = httpServer.address().port;
    clientSocket = new Client(`http://localhost:${port}`);
    io.on("connection", (socket) => {
      serverSocket = socket;
    });
    clientSocket.on("connect", done);
  });
});

afterAll(() => {
  io.close();
  clientSocket.close();
  httpServer.close();
});
