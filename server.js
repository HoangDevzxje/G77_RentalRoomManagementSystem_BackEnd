require("dotenv").config();
require("./jobs/contractReminderJob");
require("./jobs/autoGenerateInvoices")();
require("./jobs/autoConfirmMoveIn");

const https = require("https");
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
const axios = require("axios");
const ipv4Agent = new https.Agent({ family: 4 });
axios.defaults.httpsAgent = ipv4Agent;

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { checkAuthorize } = require("./middleware/authMiddleware");
const routes = require("./routes");
const path = require("path");

const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const DB = require("./configs/db");
const {
  registerAutoEndContractsCron,
  autoEndContractsOnTime,
} = require("./jobs/autoEndContracts");

const setupLaundrySocket = require("./sockets/laundrySocket");

// =========================================
//  APP & SERVER
// =========================================
const app = express();
const port = process.env.PORT || 9999;
const server = http.createServer(app);

// =========================================
//  SOCKET.IO SETUP
// =========================================
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

// cho toàn hệ thống dùng
global._io = io;

// ---------- JWT AUTH CHO SOCKET ----------
io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace("Bearer ", "");

  if (!token) {
    const err = new Error("Không có token");
    err.data = { message: "Không có token" };
    return next(err);
  }

  // Fake req/res để tái sử dụng middleware checkAuthorize()
  const req = {
    header: () => `Bearer ${token}`,
  };

  const res = {
    status: () => ({
      json: (obj) => {
        const error = new Error(obj.message || "Unauthorized");
        error.data = obj;
        return next(error);
      },
    }),
  };

  // Gọi middleware thật
  checkAuthorize()(req, res, (err) => {
    if (err) return next(err);
    socket.user = req.user; // Gắn user vào socket
    next();
  });
});

// ---------- SOCKET.IO CONNECTION ----------
io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.user.id} (${socket.user.role})`);

  // Các room mặc định (nếu bạn có logic riêng)
  try {
    require("./sockets/joinRooms")(socket, io);
  } catch (e) {
    console.warn("joinRooms not found or failed:", e.message);
  }

  // Socket realtime giặt sấy
  setupLaundrySocket(io, socket);

  socket.on("disconnect", () => {
    console.log(`❌ Socket disconnected: ${socket.user.id}`);
  });
});

app.set("io", io);

// =========================================
//  MIDDLEWARE
// =========================================
app.use("/static", express.static(path.join(__dirname, "public")));

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================
//  SWAGGER
// =========================================
const swaggerOptions = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "RRMS API",
      version: "1.0.0",
      description: "Rental Room Management System API",
    },
    servers: [
      {
        url: process.env.BASE_URL || `http://localhost:${port}`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./routes/**/*.js"],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocs, {
    swaggerOptions: { persistAuthorization: true },
  })
);

app.get("/swagger.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerDocs);
});

// =========================================
//  ROUTES
// =========================================
routes(app);

// =========================================
//  START SERVER
// =========================================
DB.connectDB()
  .then(() => {
    server.listen(port, () => {
      console.log(`🚀 Server + Socket.IO chạy tại http://localhost:${port}`);
      console.log(`📘 Swagger: http://localhost:${port}/api-docs`);
    });

    // Cron jobs
    registerAutoEndContractsCron();
    autoEndContractsOnTime();

    // Graceful shutdown
    process.on("SIGTERM", shutDown);
    process.on("SIGINT", shutDown);

    function shutDown() {
      console.log("⛔ Đang tắt server & Socket...");
      server.close(() => {
        console.log("Đã tắt.");
        process.exit(0);
      });
    }
  })
  .catch((err) => {
    console.error("❌ Failed to connect DB:", err);
  });
