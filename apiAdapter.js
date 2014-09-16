var fs = require( 'fs' );
var request = require( 'request' );
var async   = require('async'),
    request = require('request'),
    facepp  = require('./facepp.js'),
    fs      = require('fs');
/* twitter api */
var Twit = require( 'twit' );

/* secrets and tokens for applications, right now just twitter */
var credentials = require( './credentials.js' );
var config = require('./config.js');

function createDirIfNotExistent( path, finished ) {
  var exists = fs.existsSync(path); /* TODO MAKE ASYNC */
  fs.mkdir( path, finished );
}

function downloadImage(path, follower, callback){
  var url = follower.profile_image_url;
  var type = '.' + url.match(/\.(jpg|png|jpeg)$/)[1];
  var filename = path + follower.id + type;
  request.head(url, function( err ){
    if (err) { throw( "problem downloading image", err ); }
    request(  url )
      .pipe( fs.createWriteStream( filename ) )
      .on( 'close', function() {  
        follower.imagePath = filename;
        callback( filename, follower );
      })
      .on( 'error', function() {
        console.log('writing image failed for', follower.screen_name );
      })
  });

};

function processImages( path, followers, done ) {
  var count = followers.length;
  for (var i = 0; i < followers.length; i++) {
    downloadImage( path, followers[i],
     function( filename, follower ) {
      facepp.detectFace( filename,
       function( err, res, data ) {
          follower.data = data;
          finished();
          count--;
          if (count === 0) {
            done();
          }
        });
    })
  }
}

function processFollowers( followers, finished ) {
  var imageCacheDirPath = __dirname + '/imageCache/' + user._id + '/';
  async.waterfall([
      function( done ) { 
        createDirIfNotExistent( imageCacheDirPath, function( err ) {
          if ( err ) { throw( "failed to create dir", err ); }
          done( null );
        }); 
      },
      function( done ) {
        processImages( imageCacheDirPath, followers, function() {
          done( followers );
        });
      }
    ], finished);
}
/* gather data on list of followers, saves to db before returning followers */
function twitLookupFollowers( twit, user, ids, done ) {
  var followers = [];
  twit.get('users/lookup',
    {
      user_id: ids,
      include_entities: false
    },
    function ( err, data, res) {
      if ( err ) {
        throw( "error acquiring user followers", err );
      }
      for (var i in data) {
        var follower = {};
        /* just get the data we want TODO: abstract this a bit */
        follower.id                = data[i].id;
        /* get the actual full size image url for better results */
        follower.profile_image_url = data[i].profile_image_url.replace('_normal','');
        follower.name              = data[i].name;
        follower.screen_name       = data[i].screen_name;
        followers.push(follower);
      }
      user.updateFollowers( followers,
       function( err, userDoc ) {
          if ( err ) {
            throw ("error updating followers", err);
          }
          done( followers );
        });           
    });
}

/* get list of twitter followers' ids */
function twitGetFollowerIds( twit, user, done ) {
  twit.get('followers/ids',
    { 
      screen_name: user.twitterProfile.screen_name
    },
    function ( err, data, res ) {
      if ( err ) {
        throw( "error acquiring user followers", err );
      }
      done( data.ids );
    });
}

/* asks twitter for fresh follower data, saves to db before returning */
function refreshAllFollowerData( user, finished ) {
  var T = new Twit({
      consumer_key:         credentials.key
    , consumer_secret:      credentials.secret
    , access_token:         user.twitterTokens.accessToken
    , access_token_secret:  user.twitterTokens.tokenSecret
  })

  if ( Date.now() - user.lastFollowerUpdate < config.ageToRetireFollowerCache ) {
    finished( user.followers );
    return;
  }

  /* if no recent followerlist in the db, then proceed
    to find them and put it in the database. */
  var followerIds = null;
  var followers = [];
  async.waterfall([
      function( done ) {
        twitGetFollowerIds( T, user, function( ids ) {
          done( null, data.ids );
        })
      },
      function( ids, done ) {
        twitLookupFollowers( T, user, ids, function() {
          done( followers );
        })  
      }
    ], finished );
}

/* gathers fresh twitter data, then scrapes images and feeds through facepp */
function analyzeFollowerProfileImages( user, done ) {
  try {
    async.waterfall([
        function( done ) {
          user.dataProcessingInProgress = true;
          user.save();/* TODO: ENSURE FINISHES */
          refreshAllFollowerData( user, function( followers ) {
            done( null, followers );
          })
        },
        function( followers, done ) {
          processFollowers( followers, function( followersPostAnalysis ) {
            user.updateFollowers( followersPostAnalysis, function( err ) {
              done( err, followersPostAnalysis );
            })
          })
        }
      ], done);
  } catch (e) {
    return done( e, null )
  }
}

module.exports.analyzeFollowerProfileImages = analyzeFollowerProfileImages;
module.exports.refreshAllFollowerData = refreshAllFollowerData;