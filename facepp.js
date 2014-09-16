var credentials = require('./credentials.js'),
    request = require("request"),
    fs = require('fs')
    
module.exports.detectFace = function(path, callback) {
  url = "http://apius.faceplusplus.com/v2/detection/detect"
  var postRequest = request.post(url, {json: true}, function( err, res, data){
    callback( err, res, data );
  })
  var type = '.' + path.match(/\.(jpg|png|jpeg)$/)[1];
  var form = postRequest.form();
  form.append("api_key", credentials.face_key)
  form.append("api_secret", credentials.face_secret)
  var filestream = fs.createReadStream( path );
  filestream.on('error', function() { /* squelch */})
  form.append("img", filestream , { filename:  path })
}
