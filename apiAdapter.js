var fs = require( 'fs' );
var request = require( 'request' );
var facepp = require( './facepp.js' );

function downloadImage(path, follower, callback){
  var url = follower.profile_image_url;
  var type = '.' + url.match(/\.(jpg|png|jpeg)$/)[1];
  var filename = path + follower.screen_name + type;
  request.head(url, function( err ){
    if (err) { throw( "problem downloading image", err ); }
    request(  url )
      .pipe( fs.createWriteStream( filename ) )
      .on( 'close', function() {  
        callback();
      })
      .on( 'error', function() {
        console.log('writing image failed for', follower.screen_name );
      })
  });

};

function scrapeImages( path, followers, done ) {
  var count = followers.length;
  for (var i = 0; i < followers.length; i++) {
    downloadImage( path, followers[i], function() {
      count--;
      if (count === 0) {
        done();
      }
    })
  }
}

function deleteDirIfExists( path, done ) {
  fs.exists( path, function( bool ) {
        if (bool === true) {
          fs.readdir( path, function( err, files ) {
            if ( err ) { throw( "error reading files to clean imageCache", err ); }
            var count = files.length;
            for (var i = 0; i < files.length; i++) {
              fs.unlink( path + files[i], function( err ) {
                if ( err ) { throw( "error deleting file in cleaning imageCache", err ); }
                count--;
                if (count === 0) {
                  fs.rmdir( path,function( err ) {
                    if ( err ) throw( "error deleting cleaned directory when cleaning imageCach", err );
                    done();
                  })
                }
              })
            }
          })
        } 
        else {
          done();
        }
      })
}


function analyzeFollowerProfileImages( user, finished ) {
  var imageCacheDirPath = __dirname + '/imageCache/' + user._id + '/';
  var analysis = [];
  async.series([
    function( done ) {
      deleteDirIfExists( imageCacheDirPath, function() {
        done();
      });
    },
    function( done ) {
      fs.mkdir( imageCacheDirPath,
        function( err ) {
          if ( err ) { throw( "failed to make user's image cache directory", err ); }
          done();
        });
    },
    function( done ) {
      scrapeImages( imageCacheDirPath, user.followers, function() {
        done();
      });
    },
    function( done ) {
      fs.readdir( imageCacheDirPath, function( err, files ) {
        if ( err ) { throw( "problem reading directory of image files to analyze", err ); }
        var count = files.length;
        var faceDetections = []
        for ( var i in files ) {
          var path = imageCacheDirPath + files[i];
          faceDetections.push( ( function( path ) {
            return function( finished ) {
              facepp.detectFace( path, function( err, res, data ) {
                analysis.push( data );
                finished();
              });
            };
          })( path ));
        }
        async.series( faceDetections, function() {
          done();
        })
      });
    },
    function( done ) {
      deleteDirIfExists( imageCacheDirPath, function() {
        done();
      });
    }
  ], function() {
    finished( analysis );
  });
}

module.exports.analyzeFollowerProfileImages = analyzeFollowerProfileImages;