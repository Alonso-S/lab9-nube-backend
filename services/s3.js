const AWS = require("aws-sdk");
require("dotenv").config();

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

const uploadFile = (file) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${Date.now()}-${file.originalname}`,
        Body: file.buffer,
        ACL: "public-read",
    };

    return s3.upload(params).promise();
};

module.exports = { uploadFile };
