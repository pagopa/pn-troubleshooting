"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "awsClientConfig", {
  enumerable: true,
  get: function () {
    return _awsAuth.awsClientConfig;
  }
});
Object.defineProperty(exports, "basePath", {
  enumerable: true,
  get: function () {
    return _storage.basePath;
  }
});
Object.defineProperty(exports, "isLocalEnvironment", {
  enumerable: true,
  get: function () {
    return _utils.isLocalEnvironment;
  }
});
Object.defineProperty(exports, "pathJoin", {
  enumerable: true,
  get: function () {
    return _storage.pathJoin;
  }
});
Object.defineProperty(exports, "wrapper", {
  enumerable: true,
  get: function () {
    return _validator.functionWrapper;
  }
});
var _validator = require("./validator.cjs");
var _utils = require("./utils.cjs");
var _awsAuth = require("./awsAuth.cjs");
var _storage = require("./storage.cjs");