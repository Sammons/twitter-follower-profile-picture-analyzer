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
  if (!exists) fs.mkdir( path, finished );
}

function downloadImage(path, follower, callback){
  console.log('downloading image')
  var url = follower.profile_image_url;
  var type = '.' + url.match(/\.(jpg|png|jpeg)$/)[1];
  var filename = path + follower.id + type;
  follower.imagePath = filename;
  if (fs.existsSync(filename)) return callback( filename, follower );
  console.log('filename')
  request.head(url, function( err ){
    if (err) { throw( "problem downloading image", err ); }
    request(  url )
      .pipe( fs.createWriteStream( filename ) )
      .on( 'close', function() {  
        callback( filename, follower );
      })
      .on( 'error', function() {
        console.log('writing image failed for', follower.screen_name );
      })
  });

};

function processImages( path, followers, done ) {
  console.log('processing images', arguments)
  var count = followers.length;
  for (var i = 0; i < followers.length; i++) {
    downloadImage( path, followers[i],
     function( filename, thisfollower ) {
      facepp.detectFace( filename,
       function( err, res, data ) {
          thisfollower.data = data;
          count--;
          if (count === 0) {
            done( followers );
          }
        });
    })
  }
}

function processFollowers( user, followers, finished ) {
  var imageCacheDirPath = __dirname + '/imageCache/' + user._id + '/';
  async.waterfall([
      function( done ) { 
        createDirIfNotExistent( imageCacheDirPath, function( err ) {
          if ( err ) { throw( "failed to create dir", err ); }
          done( null );
        }); 
      },
      function( done ) {
        console.log('begin processing images <pre>')
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
  console.log( credentials )

  if ( Date.now() - user.lastFollowerUpdate < config.ageToRetireFollowerCache ) {
    finished( user.followers );
    return;
  }
  var T = new Twit({
      consumer_key:         credentials.key
    , consumer_secret:      credentials.secret
    , access_token:         user.tokens.accessToken
    , access_token_secret:  user.tokens.tokenSecret
  })

  /* if no recent followerlist in the db, then proceed
    to find them and put it in the database. */
  var followerIds = null;
  async.waterfall([
      function( done ) {
        twitGetFollowerIds( T, user, function( ids ) {
          done( null, ids );
        })
      },
      function( ids, done ) {
        twitLookupFollowers( T, user, ids, function( followers ) {
          finished( followers );
        })  
      }
    ] );
}

/* gathers fresh twitter data, then scrapes images and feeds through facepp */
function analyzeFollowerProfileImages( user, finished ) {
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
          processFollowers( user, followers, function( followersPostAnalysis ) {
            user.updateFollowers( followersPostAnalysis, function( err ) {/* TODO: manage this err */
              user.dataProcessingInProgress = false;
              user.save(function( err ){
                done( err, followersPostAnalysis );
              });
            })
          })
        }
      ], finished);
  } catch (e) {
    return finished( e, null )
  }
}

module.exports.analyzeFollowerProfileImages = analyzeFollowerProfileImages;
module.exports.refreshAllFollowerData = refreshAllFollowerData;