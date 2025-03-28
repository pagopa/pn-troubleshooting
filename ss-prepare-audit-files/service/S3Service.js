const { S3Client, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { Upload } = require("@aws-sdk/lib-storage");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

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

    async isInBucket(bucketName, key) {
        const headObjectCommand = new HeadObjectCommand({
            Bucket: bucketName,
            Key: key
        })
        try {
            await this.s3Client.send(headObjectCommand);
            return true;
        }
        catch (error) {
            if (error.name == "NotFound" && error.$metadata.httpStatusCode == 404)
                return false;
            else throw error;
        }
    }

    async putObject(bucketName, key, contentType, fileBytes) {
        const contentMd5 = this.getMD5HashFromFile(fileBytes);
        const uploader = new Upload({
            client: this.s3Client,
            params: { Bucket: bucketName, Key: key, ContentType: contentType, Body: fileBytes, ContentMD5: contentMd5 }
        });
        return await uploader.done();
    }

    async deleteObject(bucketName, key) {
        var command = new DeleteObjectCommand(
            {
                Bucket: bucketName,
                Key: key
            }
        );
        return await this.s3Client.send(command);
    }

    async headBucket(bucketName) {
        var command = new HeadBucketCommand(
            {
                Bucket: bucketName,
            }
        );
        try {
            return await this.s3Client.send(command);
        }
        catch (error) {
            if (error.name == "NotFound" && error.$metadata.httpStatusCode == 404)
                throw new Error(`Bucket "${bucketName}" does not exist.`);
            else throw error;
        }
    }

    async listObjectsV2(bucketName, prefix) {
        const listObjectsCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
        });

        try {
            const data = await this.s3Client.send(listObjectsCommand);
            return data.Contents || [];
        } catch (error) {
            console.error("Error in listObjectsV2: ", error);
            throw error;
        }
    }

    getMD5HashFromFile(file) {
        var hash = crypto.createHash("md5")
            .update(file)
            .digest("base64");
        return hash;
    }

}

module.exports = S3Service;