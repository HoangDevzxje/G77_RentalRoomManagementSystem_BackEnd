const mongoose = require('mongoose');
const slugify = require('slugify');

const postSchema = new mongoose.Schema(
    {
        landlordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Account',
            required: true,
        },
        buildingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Building',
            default: null,
        },
        title: { type: String, required: true, trim: true },
        slug: { type: String, unique: true },
        description: { type: String, required: true },
        address: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        area: { type: Number, required: true, min: 1 },
        images: [{ type: String }],
        isDraft: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false },

        status: {
            type: String,
            enum: ['active', 'hidden', 'expired'],
            default: 'active',
        },
    },
    { timestamps: true }
);

//Tạo slug tự động từ title
postSchema.pre('save', async function (next) {
    if (this.isModified('title') || !this.slug) {
        this.slug = slugify(this.title, { lower: true, strict: true });
    }
    next();
});

module.exports = mongoose.model('Post', postSchema);
