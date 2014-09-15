var credentials = require('./credentials.js'),
    request = require("request"),
    fs = require('fs'),
    path = require('path');

module.exports.detectFace = function(path, callback) {
  url = "http://apius.faceplusplus.com/v2/detection/detect"
  var postRequest = request.post(url, {json: true}, callback)
  var type = '.' + path.match(/\.(jpg|png|jpeg)$/)[1];
  var form = postRequest.form();
  form.append("api_key", credentials.face_key)
  form.append("api_secret", credentials.face_secret)
  form.append("img", fs.createReadStream( path ), { filename:  path })
}
