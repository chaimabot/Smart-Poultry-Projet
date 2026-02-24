const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    poulailler: {
        type: mongoose.Schema.ObjectId,
        ref: 'Poulailler',
        required: true
    },
    parameter: {
        type: String,
        required: true,
        enum: ['temperature', 'humidity', 'co2', 'nh3', 'dust', 'waterLevel']
    },
    value: {
        type: Number,
        required: true
    },
    threshold: {
        type: Number,
        required: true
    },
    direction: {
        type: String,
        enum: ['above', 'below']
    },
    severity: {
        type: String,
        enum: ['warning', 'critical'],
        default: 'warning'
    },
    read: {
        type: Boolean,
        default: false
    },
    resolvedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Alert', alertSchema);
