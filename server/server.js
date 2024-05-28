require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Chat = require('./models/Chat');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Could not connect to MongoDB', err);
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/signup.html'));
});

app.post('/signup', async (req, res) => {
    const { username, email, password, firstName, lastName, bio } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).send('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        username,
        email,
        password: hashedPassword,
        firstName,
        lastName,
        bio
    });

    try {
        await newUser.save();
        res.status(201).redirect(`/chat?username=${newUser.username}`);
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).send('Server error');
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(404).send('User not found');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
        return res.status(401).send('Invalid password');
    }

    res.status(200).redirect(`/chat?username=${user.username}`);
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/chat.html'));
});

// Socket.io handling
io.on('connection', socket => {
    console.log('New client connected');

    // Emit user list to clients
    socket.on('getUserList', async () => {
        try {
            const users = await User.find({}, 'username firstName lastName email');
            io.emit('userList', users);
        } catch (err) {
            console.error('Error retrieving user list:', err);
        }
    });

    // Handle message sending
    socket.on('sendMessage', async message => {
        try {
            await Chat.create(message);
            io.emit('message', message);
        } catch (err) {
            console.error('Error sending message:', err);
        }
    });

    // Disconnect event
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});


app.get('/messages', async (req, res) => {
    const { from, to } = req.query;

    try {
        const messages = await Chat.find({
            $or: [
                { from: from, to: to },
                { from: to, to: from }
            ]
        }).sort({ createdAt: 1 }); // Sort messages by creation date

        res.status(200).json(messages);
    } catch (err) {
        console.error('Error retrieving messages:', err);
        res.status(500).send('Server error');
    }
});

app.get('/user', async (req, res) => {
    const { username } = req.query;

    try {
        const user = await User.findOne({ username }, '-password'); // Exclude password
        if (user) {
            res.status(200).json(user);
        } else {
            res.status(404).send('User not found');
        }
    } catch (err) {
        console.error('Error retrieving user:', err);
        res.status(500).send('Server error');
    }
});
