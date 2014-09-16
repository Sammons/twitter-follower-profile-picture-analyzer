/* server framework */
var express = require( 'express' );

/* tools */
var async   = require('async'),
    request = require('request'),
    facepp  = require('./facepp.js'),
    fs      = require('fs');

/* secrets and tokens for applications, right now just twitter */
var credentials = require( './credentials.js' );

/* twitter api */
var Twit = require( 'twit' );

/* setting up sessions and passport middleware, as well as other
  request parsing/ cookieparsing middleware.... it's all here */
var appSetup = require( './appSetup.js' );
 
/* database wrapper, for convenient loading and saving of user data */
var db = require( './databaseInterface.js' );
db.connect( function( err ) {
  if ( err !== null ) {
    throw( "Failed to connect to mongo!", err );
  }
  console.log( "connected to mongodb" );
})

/* initialize our application object */
var app = express();

/* inject the middleware into the stack */
appSetup.injectMiddleware( app );

/* add the passport routing for twitter authentication */
appSetup.setupAuth( app );

/* standard-style ejs templating */
app.set('view engine', 'ejs');

/* configure the root since this is a "single page app",
  pretty much everything else is an ajax request. */
app.get( '/', function( request, response ) {
  response.render( 'index' );
})

/* custom middleware to detect if a request has
  no authorized session to back it. In our case they
  really can't have a req.user property unless they
  are spoofing a session and fooling express-session,
  or have authorized with twitter. */
function ensureLoggedIn( req, res, next ) {
  if ( !req.user ) {
    console.log('stopped unauthorized request')
    res.end();
  } else {
    next();    
  }
}

/* endpoints for ajax */
app.get( '/profileData', function( request, response ) {
  var responseJson = { data: null };
  if ( !!request.user ) {
    responseJson.data = request.user.twitterProfile._json;
  }
  response.json( responseJson );
})


var entitiesToGet = [
    "name",
    "screen_name",
    "profile_image_url"
    ]

app.post( '/timeToFetchFollowers',
 ensureLoggedIn,
  function( request, response) {
  var T = new Twit({
      consumer_key:         credentials.key
    , consumer_secret:      credentials.secret
    , access_token:         request.user.twitterTokens.accessToken
    , access_token_secret:  request.user.twitterTokens.tokenSecret
  })

  if ( Date.now() - request.user.lastFollowerUpdate < config.ageToRetireFollowerCache ) {
    response.json( { 'followers': request.user.followers } );
    return;
  }

  /* if no recent followerlist in the db, then proceed
    to find them and put it in the database. */
  var followerIds = null;
  var followers = [];
  async.series([
      function( done ) {
        T.get('followers/ids',
        { 
          screen_name: request.user.twitterProfile.screen_name
        },
        function (err, data, res) {
          //TODO handle err
          followerIds = data.ids;
          done();
        });
      },
      function( done ) {
        T.get('users/lookup',
        {
          user_id: followerIds,
          include_entities: false
        },
        function ( err, data, res) {
          for (var i in data) {
            var follower = {};
            follower.id                = data[i].id;
            follower.profile_image_url = data[i].profile_image_url.replace('_normal','');
            follower.name              = data[i].name;
            follower.screen_name       = data[i].screen_name;

            followers.push(follower);
          }
          request.user.updateFollowers( followers,
           function( err, userDoc ) {
              response.json( { 'followers': followers } );
              done();
            });           
        });
      }
    ]);
})

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

app.get( '/analysis',
 ensureLoggedIn,
  function( request, response ) {
    analyzeFollowerProfileImages( request.user,
      function( analysis ) {
        response.json( { data: analysis } );
      });
})

/* start application */
app.set( 'port', 3000 );
app.listen( app.get( 'port' ), function() {
  console.log( 'server started on port', app.get( 'port' ) )
})