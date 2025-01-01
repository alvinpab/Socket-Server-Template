const http = require("http");
const express = require("express");
const app = express();

app.use(express.static("public"));

const serverPort = process.env.PORT || 3000;
const server = http.createServer(app);
const WebSocket = require("ws");

let keepAliveId;

// WebSocket server setup
const wss =
  process.env.NODE_ENV === "production"
    ? new WebSocket.Server({ server })
    : new WebSocket.Server({ port: 5001 });

server.listen(serverPort);
console.log(`Server started on port ${serverPort} in stage ${process.env.NODE_ENV}`);

// User ID management
const availableIds = Array.from({ length: 10 }, (_, i) => `User${String(i + 1).padStart(2, '0')}`);
const assignedIds = new Map(); // Map WebSocket clients to assigned IDs

wss.on("connection", function (ws, req) {
  console.log("Connection Opened");
  console.log("Client size: ", wss.clients.size);

  if (wss.clients.size === 1) {
    console.log("First connection. Starting keepAlive.");
    keepServerAlive();
  }

  // Assign a unique ID to the new connection
  if (availableIds.length > 0) {
    const assignedId = availableIds.shift();
    assignedIds.set(ws, assignedId);
    ws.send(JSON.stringify({ userId: assignedId }));
    console.log(`Assigned ${assignedId}`);
  } else {
    ws.send(JSON.stringify({ error: "No IDs available" }));
    console.log("No IDs available for new connection.");
  }

  ws.on("message", (data) => {
    let stringifiedData = data.toString();

    if (stringifiedData === "pong") {
      console.log("keepAlive");
      return;
    }

    // Log and broadcast received data
    console.log(`Received from ${assignedIds.get(ws) || "Unknown"}: ${stringifiedData}`);
    broadcast(ws, stringifiedData, false);
  });

  ws.on("close", () => {
    console.log("Closing connection");

    // Recycle the ID when a client disconnects
    const disconnectedId = assignedIds.get(ws);
    if (disconnectedId) {
      assignedIds.delete(ws);
      availableIds.push(disconnectedId);
      console.log(`Recycled ID: ${disconnectedId}`);
    }

    if (wss.clients.size === 0) {
      console.log("Last client disconnected, stopping keepAlive interval");
      clearInterval(keepAliveId);
    }
  });
});

// Broadcast function
const broadcast = (ws, message, includeSelf) => {
  if (includeSelf) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } else {
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
};

// Keep server alive by sending pings to all clients
const keepServerAlive = () => {
  keepAliveId = setInterval(() => {
    wss.cli
