require("dotenv").config();
const express = require("express");
const cors = require("cors");
const routes = require("./routes");

const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const DB = require("./configs/db");
const { startExpirationJob } = require("./utils/cron/expireSubscriptions");

const app = express();
const port = process.env.PORT || 9999;

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

// Cấu hình CORS trước tiên
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
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
  swaggerOptions: {
    persistAuthorization: true,
  }
}));
app.get("/swagger.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerDocs);
});

routes(app);

DB.connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`✅ Server is running at http://localhost:${port}`);
    });
    startExpirationJob();
    // Graceful shutdown
    process.on('SIGTERM', shutDown);
    process.on('SIGINT', shutDown);

    function shutDown() {
      console.log('Đang tắt server...');
      server.close(() => {
        console.log('Server đã tắt.');
        process.exit(0);
      });
    }
  })
  .catch((err) => {
    console.error("❌ Failed to connect DB:", err);
  });
