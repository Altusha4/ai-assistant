require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const courseRoutes = require('./routes/courseRoutes');

const { User, bcrypt, jwt, JWT_SECRET, authenticateToken } = require('./auth');

const app = express();

connectDB();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, username, password } = req.body;

        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({
                error: existingUser.email === email ? "Email already registered" : "Username already taken"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            name,
            email,
            username,
            password: hashedPassword
        });

        await user.save();
        res.status(201).json({ message: "Registration successful! Please login." });
    } catch (err) {
        console.error("Registration Error:", err);
        res.status(500).json({ error: "Server error during registration" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid password" });
        }

        const token = jwt.sign(
            { userId: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            name: user.name,
            username: user.username
        });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Server error during login" });
    }
});

app.use('/api/courses', courseRoutes);

const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));


app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
        return res.status(404).json({ error: "API route not found" });
    }

    if (req.method === 'GET') {
        const indexPath = path.join(frontendPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        } else {
            return res.status(404).send("Frontend build not found. Run your frontend build or check path.");
        }
    }
    next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
Study-Fit AI Server is LIVE!
-------------------------------
URL: http://localhost:${PORT}
Frontend: ${frontendPath}
Database: Connected
-------------------------------
    `);
});