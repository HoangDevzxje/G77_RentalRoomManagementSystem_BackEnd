const mongoose = require('mongoose');

const buildingRatingSchema = new mongoose.Schema({
    buildingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Building',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
        index: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        trim: true,
        maxlength: 500
    },
    images: [String],
}, { timestamps: true });

buildingRatingSchema.index({ buildingId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('BuildingRating', buildingRatingSchema);