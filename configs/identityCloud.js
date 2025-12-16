const cloudinary = require("cloudinary").v2;
const fs = require("fs");

async function uploadIdentityToCloud(files, contractId, tenantId) {
    const folder = `contracts/${contractId}/identity/${tenantId}`;

    const result = {};

    const uploadOne = async (file, key) => {
        try {
            const uploaded = await cloudinary.uploader.upload(file.path, {
                folder,
                resource_type: "image",
                transformation: [{ width: 1600, crop: "limit" }],
            });

            result[key] = uploaded.secure_url;
        } finally {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        }
    };

    if (files.cccdFront?.[0]) {
        await uploadOne(files.cccdFront[0], "cccdFrontUrl");
    }

    if (files.cccdBack?.[0]) {
        await uploadOne(files.cccdBack[0], "cccdBackUrl");
    }

    if (files.selfie?.[0]) {
        await uploadOne(files.selfie[0], "selfieUrl");
    }

    return result;
}

module.exports = { uploadIdentityToCloud };
