/* access to built in express middleware */
var express = require( 'express' );

/* naive sessions (they don't use redis or anything cool) */
var session = require( 'express-session' );

/* middleware that handles authentication */
var passport        = require( 'passport'         ),
    TwitterStrategy = require( 'passport-twitter' ).Strategy;

/* middleware that parses requests */
var cookieParser = require( 'cookie-parser'),
    bodyParser   = require( 'body-parser'  );

/* middleware that logs request details */
var morgan = require( 'morgan' );

/* include the database interface */
var db = require( './databaseInterface.js' );

/* for the passport twitter strategy to formulate the redirect route to twitter */
var credentials = require( './credentials.js' );

/* app setup details */
var config = require( './config.js' );

/* configure the serialization and 
deserialization of the passport user 
from the session. The session should contain
as little as possible and put everything else
in the database */
passport.serializeUser( function( user, done ) {
  done(null, user._id);
});

passport.deserializeUser(function(id, done) {
  /* standard find the user and pull them out of the db fare */
  db.user.findById(id, function (err, user) {
    done(err, user);
  });
});


/* when passport funnels the user back to the application,
  the information passport has gotten from twitter gets piped into this
  function, we never want to decline people who authorized via oauth,
  so this has upsert functionality. */
function checkInTwitterUser(accessToken, tokenSecret, profile, done) {

  db.user.updateTokensAndProfileOrCreateUser( { 
      'twitterProfile' : profile,
      'tokens' : {
        'accessToken' : accessToken,
        'tokenSecret' : tokenSecret
      } 
    },
    function( err, userDoc ) {
      userDoc.save(function(error) {
        done( error, userDoc);
      });
    });

}

module.exports.injectMiddleware = function( app ) {

  passport.use( 
    new TwitterStrategy({
        consumerKey: credentials.key,
        consumerSecret: credentials.secret,
        callbackURL: config.twitterAuthCallbackUrl
      },
    checkInTwitterUser)
  );

  /* configure the app middleware */
  app.use( morgan( config.logMode ) );/* first thing, log the request     */
  app.use( express.static( config.assetFolder ) );/* asset serving        */
  app.use( cookieParser()           );/* parse the cookie if there is one */
  app.use( bodyParser.json()        );/* parse the body if it is json     */

  app.use(session({ /* then load up the session into the request */
    secret:             config.sessionSecret,
    saveUninitialized:  true,
    resave:             true,
    cookie: { path: '/', httpOnly: true, secure: false, maxAge: config.sessionMaxAge }
  }));

  app.use( passport.initialize() );/* inject the passport middleware here (after session and parsing stuff) */
  app.use( passport.session()    );/* convenient access to session.user data */

  app.use( function( req, res, next ) {
    /* custom middleware to detect if there is a user session
      which indicates that they have logged in, assuming no session
      spoofing going on. 

      TODO: We could save the last visited time in the serialize
      method, and require that visitors have their cookie say the same time
      as the database - otherwise have them re-login. */
    if (req.user) {
      req.authenticated = true;
    } 
    else {
      req.authenticated = false;
    }
    next();
  })

}

module.exports.setupAuth = function( app ) {
  /* call passport.authenticate the first time to initiate the auth process,
  in this case the user is redirected out of the application. In this
  app this is where a new window pops up. */
  app.get( '/auth/twitter', passport.authenticate( 'twitter' ) );

  /* call passport.authenticate the second time, this is the return of the user */
  app.get( '/auth/twitter/callback',
    passport.authenticate( 'twitter', { failureRedirect: '/' } ),
      function( req, res ) {
        /* we collect the data from the oauth authentication
            within the passport strat (see the middleware), so this new window
            can now be closed. /close serves a self-closing html doc */
        res.redirect( '/close' );
      });

  /* page that has js that calls window.close() immediately */
  app.get('/close', function( request, response ) {
    response.render( 'pageThatClosesImmediately' );
  })
}
