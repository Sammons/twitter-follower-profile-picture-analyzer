var credentials = require('./credentials.js'),
    request = require("request"),
    fs = require('fs')
    
module.exports.detectFace = function(imgUrl, callback) {
  url = "http://apius.faceplusplus.com/v2/detection/detect"
  var postRequest = request.post(url, {json: true}, function( err, res, data){
    console.log( arguments )
    callback( err, res, data );
  })
  var form = postRequest.form();
  
  form.append("api_key", credentials.face_key)
  form.append("api_secret", credentials.face_secret)
  form.append("url", imgUrl)
}
