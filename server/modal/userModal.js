const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        index: true,
        lowercase: true,
        trim: true
    },
    username: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    provider: {
        type: String,
        enum: ['password', 'google', 'guest'],
        default: 'password',
        index: true
    },
    firebaseUid: { type: String, default: '', index: true },
    picture: { type: String, default: '' },
    favorites: { type: [String], default: [] },
    recentlyPlayed: {
        type: [{
            gameId: { type: String, required: true },
            playedAt: { type: Date, default: Date.now }
        }],
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
