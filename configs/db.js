const mongoose = require("mongoose");
const UserInformation = require("../models/UserInformation");
const Account = require("../models/Account");

const DB = {
    user: UserInformation,
    account: Account,
};

DB.connectDB = async () => {
    try {
        await mongoose.connect(process.env.DB_CONNECTION_CLOUD, {
            dbName: process.env.DB_NAME,
        });
        console.log("Connected to the cloud database (MongoDB Atlas)");
    } catch (err) {
        console.warn("Cloud connection failed. Trying local...");

        try {
            await mongoose.connect(process.env.DB_CONNECTION_LOCAL, {
                dbName: process.env.DB_NAME,
            });
            console.log("Connected to the local database (MongoDB)");
        } catch (localErr) {
            console.error("Could not connect to any database", localErr);
            process.exit(1); // Dừng chương trình
        }
    }
};

module.exports = DB;
