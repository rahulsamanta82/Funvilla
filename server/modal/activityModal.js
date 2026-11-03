const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    action: {
        type: String,
        required: true,
        enum: ['signup', 'login', 'logout', 'play', 'favorite_add', 'favorite_remove'],
        index: true
    },
    gameId: { type: String, trim: true },
    gameTitle: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

activitySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);