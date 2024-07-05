const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require("@aws-sdk/lib-storage");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
var crypto = require("crypto");

class S3Service {
    constructor(awsProfile, region) {
        var confinfoCredentials;
        if (awsProfile != null) { confinfoCredentials = fromSSO({ profile: awsProfile })(); }
        this.s3Client = new S3Client({
            region: region,
            credentials: confinfoCredentials
        });
    }

    async getObject(bucketName, key) {
        const getObjectCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: key
        })
        return await this.s3Client.send(getObjectCommand);
    }

    async getObjectMetadata(bucketName, key) {
        const headObjectCommand = new HeadObjectCommand({
            Bucket: bucketName,
            Key: key
        })
        return await this.s3Client.send(headObjectCommand);
    }

    async putObject(bucketName, key, contentType, fileBytes) {
        const contentMd5 = this.getMD5HashFromFile(fileBytes);
        const uploader = new Upload({
            client: this.s3Client,
            params: { Bucket: bucketName, Key: key, ContentType: contentType, Body: fileBytes, ContentMD5: contentMd5 }
        });
        return await uploader.done();
    }

    getMD5HashFromFile(file) {
        var hash = crypto.createHash("md5")
            .update(file)
            .digest("base64");
        return hash;
    }

}

module.exports = S3Service;