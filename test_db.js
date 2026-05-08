import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/user.model.js';

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");
        const count = await User.countDocuments();
        console.log("All users count:", count);
        const subCount = await User.countDocuments({ 'subscription.status': 'active' });
        console.log("Subscribed users count:", subCount);
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

test();
