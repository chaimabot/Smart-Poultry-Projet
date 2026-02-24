const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
    poulailler: {
        type: mongoose.Schema.ObjectId,
        ref: 'Poulailler',
        required: true
    },
    typeActionneur: {
        type: String,
        enum: ['porte', 'ventilateur'],
        required: true
    },
    action: {
        type: String,
        required: true // e.g., 'ouvrir', 'fermer', 'demarrer', 'arreter'
    },
    issuedBy: {
        type: String, // 'system', 'user', 'scheduler'
        default: 'system'
    },
    issuedAt: {
        type: Date,
        default: Date.now
    },
    executedAt: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'sent', 'executed', 'failed'],
        default: 'pending'
    },
    source: String // e.g., 'mobile-app', 'automated-rule'
}, {
    timestamps: true
});

module.exports = mongoose.model('Command', commandSchema);
