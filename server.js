require("dotenv").config();
require("./jobs/contractReminderJob");
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
const { startExpirationJob } = require("./utils/cron/expireSubscriptions");
const { registerAutoEndContractsCron } = require("./jobs/autoEndContracts");

// Khởi tạo app + server
const app = express();
const port = process.env.PORT || 9999;
const server = http.createServer(app);

// ==================== SOCKET.IO SETUP ====================
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

// Middleware xác thực Socket.IO (bắt buộc có JWT)
io.use((socket, next) => {
  const req = {
    header: (key) => {
      if (key === "Authorization") {
        const token =
          socket.handshake.auth.token || socket.handshake.headers.authorization;
        return token ? `Bearer ${token}` : null;
      }
      return null;
    },
  };

  const res = {
    status: (code) => ({
      json: (obj) => {
        const error = new Error(obj.message || "Unauthorized");
        error.data = obj;
        return next(error);
      },
    }),
  };

  checkAuthorize()(req, res, (err) => {
    if (err) return next(err);
    socket.user = req.user;
    next();
  });
});

// Xử lý kết nối + join room tự động
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.id} (${socket.user.role})`);

  // Gọi hàm join room thông minh (tách riêng file cho dễ bảo trì)
  require("./sockets/joinRooms")(socket, io);

  // Các event khác (chat, typing, v.v.) sẽ import ở đây
  require("./sockets/notificationSocket")(socket, io);
  // require("./sockets/chatSocket")(socket, io);

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.user.id}`);
  });
});

app.set("io", io);

// ==================== END SOCKET.IO ====================

app.use("/static", express.static(path.join(__dirname, "public")));
const swaggerOptions = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "RRMS API",
      version: "1.0.0",
      description: "API Rental Room Management System",
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

// Cấu hình CORS
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger setup
const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocs, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  })
);
app.get("/swagger.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerDocs);
});

routes(app);

DB.connectDB()
  .then(() => {
    server.listen(port, () => {
      console.log(`Server + Socket.IO running at http://localhost:${port}`);
      console.log(`Swagger: http://localhost:${port}/api-docs`);
    });
    registerAutoEndContractsCron();
    startExpirationJob();
    // Graceful shutdown
    process.on("SIGTERM", shutDown);
    process.on("SIGINT", shutDown);

    function shutDown() {
      console.log("Đang tắt server & Socket.IO...");
      server.close(() => {
        console.log("Server closed.");
        process.exit(0);
      });
    }
  })
  .catch((err) => {
    console.error("❌ Failed to connect DB:", err);
  });
