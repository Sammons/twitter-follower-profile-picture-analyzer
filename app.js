/* server framework */
var express         = require( 'express' );

/* naive sessions (they don't use redis or anything cool) */
var session         = require( 'express-session' );

/* middleware that handles authentication */
var passport        = require( 'passport'         ),
    TwitterStrategy = require( 'passport-twitter' ).Strategy;

/* middleware that parses requests */
var cookieParser = require( 'cookie-parser'),
    bodyParser   = require( 'body-parser'  );

/* middleware that logs request details */
var morgan = require( 'morgan' );

/* tools */
var async = require('async');

/* database interaction, for convenience just use Mongoose & Mongo */
var mongoose = require( 'mongoose' );

/* secrets and tokens for applications, right now just twitter */
var credentials = require( './credentials.js' );

/* twitter api */
var Twit = require('twit');


/* initialize our application object */
var app = express();



/* prepare database models & operations */
mongoose.connect( 'mongodb://localhost/test', function( err ) {
  if ( err ) { throw ( "Failed to connect to mongo", err ); }
  console.log( 'connected to mongo' );
});

var Schema = mongoose.Schema;

var UserSchema = new Schema({
  twitterProfile: Schema.Types.Mixed, /* generic twitter data */
  twitterTokens: {
    accessToken: String,
    tokenSecret: String
  },
  followers: [],
  lastFollowerUpdate: Number
})


UserSchema.statics.findOrCreateUser = function( profile, done ) {
  var User = this;
  User.findOne( { twitterProfile: { id: profile.id } },
   function( error, userDoc ) {
    if (error) { throw( "failed to find/create user", error ); }
    if (userDoc === null) {
      userDoc = new User();
    }
    userDoc.twitterProfile = profile;
    userDoc.markModified('twitterProfile');
    done (null, userDoc); 
  });
}

UserSchema.statics.updateFollowers = function( id, followers, done) {
  var User = this;
  User.findById( id,
   function( error, userDoc ) {
    if (error) { throw( "failed to find/create user", error ); }
    userDoc.followers = followers;
    userDoc.markModified( 'followers' );
    userDoc.lastFollowerUpdate = Date.now();
    userDoc.save( function( err ) {
      if (err) throw( "failed to update followers", err );
      done ( null, userDoc ); 
    })
  });
}
var User = mongoose.model( 'user', UserSchema );


/* configure the serialization and 
  deserialization of the passport user 
  from the session. The session should contain
  as little as possible and put everything else
  in the database */
passport.serializeUser( function( user, done ) {
  done(null, user._id);
});


passport.deserializeUser(function(id, done) {
  /* standard find the user and pull them out of the db, fare */
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

function verifyTwitterUser(accessToken, tokenSecret, profile, done) {
  User.findOrCreateUser( profile , function( err, userDoc ) {
    userDoc.twitterTokens.accessToken = accessToken;
    userDoc.twitterTokens.tokenSecret = tokenSecret;
    userDoc.save(function(error) {
      done( error, userDoc);
    });
  })
}


passport.use( 
  new TwitterStrategy({
      consumerKey: credentials.key,
      consumerSecret: credentials.secret,
      callbackURL: "http://127.0.0.1:3000/auth/twitter/callback"
    },
  verifyTwitterUser)
);

/* configure the app middleware */
app.use( morgan('dev')            );/* first thing, log the request     */
app.use( express.static('public') );/* asset serving                    */
app.use( cookieParser()           );/* parse the cookie if there is one */
app.use( bodyParser.json()        );/* parse the body if it is json     */

app.use(session({ /* then load up the session into the request */
  secret:            "keyboard mouse",
  saveUninitialized:  true,
  resave:             true
}));

app.use( passport.initialize() );/* inject the passport middleware here (after session and parsing stuff) */
app.use( passport.session()    );/* convenient access to session.user data */

app.get('/auth/twitter', passport.authenticate('twitter'));
// GET /auth/twitter/callback
// Use passport.authenticate() as route middleware to authenticate the
// request. If authentication fails, the user will be redirected back to the
// login page. Otherwise, the primary route function function will be called,
// which, in this example, will redirect the user to the home page.
app.get('/auth/twitter/callback',
passport.authenticate('twitter', { failureRedirect: '/' }),
function(req, res) {
  res.redirect('/close');
});


/* simple templating */
app.set('view engine', 'ejs');

app.get('/close', function( request, response ) {
  response.render( 'pageThatClosesImmediately' );
})

/* configure the page, since this is a single page app */
app.get( '/', function( request, response ) {
  response.render( 'index' );
})


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

  if ( Date.now() - request.user.lastFollowerUpdate < 1000*60*5) {
    console.log()
    response.json( { 'followers': request.user.followers } );
    return;
  }

  /* if no recent followerlist in the db, then proceed
    to find them and put it in the database. */
  var followerIds = null;
  var followers = [];
  async.series([
      function( done ) {
        console.log('beginning follower list search')
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
        console.log('beginning lookup')
        T.get('users/lookup',
        {
          user_id: followerIds,
          include_entities: false
        },
        function ( err, data, res) {
          for (var i in data) {
            var follower = {};
            follower.id = data[i].id;
            follower.profile_image_url = data[i].profile_image_url;
            follower.name = data[i].name;
            follower.screen_name = data[i].screen_name;
            followers.push(follower);
          }
          User.updateFollowers( 
            request.user._id,
            followers,
            function( err, userDoc ) {
              console.log( followers );
              response.json( { 'followers': followers } );
              done();
            });
        });
      }
    ]);
})

app.get( '/analysis',
 ensureLoggedIn,
  function( request, response ) {

})

/* start application */
app.set( 'port', 3000 );
app.listen( app.get( 'port' ), function() {
  console.log( 'server started on port', app.get( 'port' ) )
})