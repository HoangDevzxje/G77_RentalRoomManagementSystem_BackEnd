require("dotenv").config();
const express = require("express");
const cors = require("cors");
const routes = require('./routes');

const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const DB = require("./configs/db");

const app = express();
const port = process.env.PORT || 9999;

const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "RRMS API",
            version: "1.0.0",
            description: "API Rental Room Management System"
        },
        servers: [
            {
                url: "http://localhost:9999"
            }
        ]
    },
    apis: ["./routes/*.js"]
};
const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
// Middleware
app.use(cors());
app.use(express.json());

// Routes
routes(app);

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    DB.connectDB();
});
